// POST /api/terminal/create_payment_intent
// The on-reader app calls this to create a card-present PaymentIntent it then
// collects + confirms ON the device. Mirrors /api/admin/pos/charge's accounting
// wiring (same source='pos' metadata + pending stripe_charges row → the webhook
// records the transaction) but uses MANUAL capture and does NOT push to a reader
// (the device collects locally via the SDK).
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { isDeviceAuthorized } from '@/lib/device-auth'
import { findOrCreateCustomerIdByEmail } from '@/lib/customers'
import { computeTaxCents } from '@/lib/tax'

export const runtime = 'nodejs'

type SaleType = 'in_person_sale' | 'booking_income' | 'other_income'
const VALID_TYPES: SaleType[] = ['in_person_sale', 'booking_income', 'other_income']

interface Body {
  amountCents?: number
  description?: string
  saleType?: SaleType
  customerId?: string | null
  bookingId?: string | null
  receiptEmail?: string | null
  // Split payments: when true, amountCents is the EXACT amount to charge
  // (already tax-inclusive) and taxCents is its tax portion — we don't add tax.
  // Used for the card half of a part-cash/part-card sale.
  amountIncludesTax?: boolean
  taxCents?: number
  // RC car racing upsell (pre-tax) already INCLUDED in amountCents — broken out
  // only so reports can separate RC revenue from simulator revenue.
  rcCents?: number
}

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const amountCents = body.amountCents
  if (!Number.isInteger(amountCents) || (amountCents as number) < 50) {
    return NextResponse.json({ error: 'Amount must be at least $0.50.' }, { status: 400 })
  }
  const saleType: SaleType = VALID_TYPES.includes(body.saleType as SaleType)
    ? (body.saleType as SaleType)
    : 'in_person_sale'
  const description = (body.description ?? '').trim() || 'In-person sale'

  // Sales tax. Normally amountCents is the pre-tax subtotal and we add tax.
  // For a split payment's card half, amountCents is already the exact (tax-
  // inclusive) amount to charge and taxCents is its tax portion — don't re-add.
  let subtotalCents: number
  let taxCents: number
  let chargeCents: number
  if (body.amountIncludesTax) {
    chargeCents = amountCents as number
    taxCents = Math.max(0, Math.min(chargeCents, Math.round(body.taxCents ?? 0)))
    subtotalCents = chargeCents - taxCents
  } else {
    subtotalCents = amountCents as number
    taxCents = computeTaxCents(subtotalCents)
    chargeCents = subtotalCents + taxCents
  }

  const supabase = createAdminClient()
  const stripe = getStripe()

  // Resolve the customer + Stripe customer + receipt email. A walk-in who gives
  // an email but no customerId gets linked (find-or-create) so they receive a
  // receipt + build long-term history — same as the web POS.
  let receiptEmail = body.receiptEmail?.trim() || undefined
  let customerId = body.customerId?.trim() || null
  if (!customerId && receiptEmail) {
    customerId = await findOrCreateCustomerIdByEmail(supabase, receiptEmail)
  }

  let stripeCustomerId: string | undefined
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, stripe_customer_id')
      .eq('id', customerId)
      .maybeSingle()
    if (customer) {
      receiptEmail = receiptEmail ?? customer.email ?? undefined
      stripeCustomerId = customer.stripe_customer_id ?? undefined
      if (!stripeCustomerId) {
        const sc = await stripe.customers.create({
          email: customer.email ?? undefined,
          name: `${customer.first_name} ${customer.last_name}`.trim(),
          metadata: { supabase_customer_id: customer.id },
        })
        stripeCustomerId = sc.id
        await supabase
          .from('customers')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', customer.id)
      }
    }
  }

  const idempotencyKey = `pos-device-${randomUUID()}`

  const intent = await stripe.paymentIntents.create(
    {
      amount: chargeCents,
      currency: 'usd',
      payment_method_types: ['card_present'],
      // MANUAL capture: the device collects + confirms, then the app captures
      // (so the on-reader tip is included in the final amount).
      capture_method: 'manual',
      customer: stripeCustomerId,
      receipt_email: receiptEmail,
      description,
      payment_method_options: {
        card_present: {
          // Allow the final captured amount (incl. tip) to exceed the auth.
          request_extended_authorization: true,
          request_incremental_authorization_support: true,
        },
      },
      metadata: {
        source: 'pos',
        sale_type: saleType,
        booking_id: (saleType === 'booking_income' ? body.bookingId : null) ?? '',
        supabase_customer_id: customerId ?? '',
        admin_user_id: '', // device charge — webhook coerces '' → null
        device: 'reader',
        subtotal_cents: String(subtotalCents),
        tax_cents: String(taxCents),
        rc_cents: String(Math.max(0, Math.round(body.rcCents ?? 0))),
      },
    },
    { idempotencyKey }
  )

  await supabase.from('stripe_charges').insert({
    stripe_payment_intent_id: intent.id,
    booking_id: (saleType === 'booking_income' ? body.bookingId : null) || null,
    customer_id: customerId,
    amount_cents: chargeCents,
    currency: 'usd',
    status: 'pending',
    payment_method_type: 'stripe_terminal',
    reason: description,
    idempotency_key: idempotencyKey,
  })

  return NextResponse.json({
    paymentIntentId: intent.id,
    secret: intent.client_secret,
  })
}
