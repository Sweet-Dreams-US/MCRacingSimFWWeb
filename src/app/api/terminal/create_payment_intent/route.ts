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

  const supabase = createAdminClient()
  const stripe = getStripe()

  // Resolve the Stripe customer + receipt email (same as the web POS route).
  let stripeCustomerId: string | undefined
  let receiptEmail = body.receiptEmail?.trim() || undefined

  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, stripe_customer_id')
      .eq('id', body.customerId)
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
      amount: amountCents as number,
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
        supabase_customer_id: body.customerId ?? '',
        admin_user_id: '', // device charge — webhook coerces '' → null
        device: 'reader',
      },
    },
    { idempotencyKey }
  )

  await supabase.from('stripe_charges').insert({
    stripe_payment_intent_id: intent.id,
    booking_id: (saleType === 'booking_income' ? body.bookingId : null) || null,
    customer_id: body.customerId || null,
    amount_cents: amountCents as number,
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
