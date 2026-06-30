// POST /api/admin/pos/charge
// Start an in-person card-present payment on the Terminal reader.
//
// Links the charge to a Stripe Customer (so it lives alongside the customer's
// website bookings) and optionally to a booking. Records a pending
// stripe_charges row; the transaction is recorded on success by the webhook
// (payment_intent.succeeded, source=pos).
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { getActiveReader, processOnReader } from '@/lib/terminal'

export const runtime = 'nodejs'

type SaleType = 'in_person_sale' | 'booking_income' | 'other_income'
const VALID_TYPES: SaleType[] = ['in_person_sale', 'booking_income', 'other_income']

interface ChargeBody {
  amountCents: number
  type: SaleType
  description: string
  customerId?: string | null // our customers.id
  bookingId?: string | null
  receiptEmail?: string | null
}

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const body = (await request.json()) as ChargeBody

  if (!Number.isInteger(body.amountCents) || body.amountCents < 50) {
    return NextResponse.json(
      { success: false, error: 'Amount must be at least $0.50.' },
      { status: 400 }
    )
  }
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ success: false, error: 'Invalid sale type.' }, { status: 400 })
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ success: false, error: 'Description is required.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const stripe = getStripe()

  // Resolve the Stripe customer + receipt email (if a customer was selected)
  let stripeCustomerId: string | undefined
  let receiptEmail = body.receiptEmail?.trim() || undefined

  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('id, email, first_name, last_name, stripe_customer_id')
      .eq('id', body.customerId)
      .maybeSingle()

    if (customer) {
      receiptEmail = receiptEmail ?? customer.email
      stripeCustomerId = customer.stripe_customer_id ?? undefined
      if (!stripeCustomerId) {
        const sc = await stripe.customers.create({
          email: customer.email,
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

  // Make sure there's an online reader before we create the intent
  const reader = await getActiveReader()
  if (!reader) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No Terminal reader found online. Check the reader is powered on and connected to Wi-Fi.',
      },
      { status: 409 }
    )
  }

  const idempotencyKey = `pos-${randomUUID()}`

  // Create the card_present PaymentIntent
  const intent = await stripe.paymentIntents.create(
    {
      amount: body.amountCents,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      customer: stripeCustomerId,
      receipt_email: receiptEmail,
      description: body.description.trim(),
      metadata: {
        source: 'pos',
        sale_type: body.type,
        booking_id: body.bookingId ?? '',
        supabase_customer_id: body.customerId ?? '',
        admin_user_id: adminCtx.admin.id,
      },
    },
    { idempotencyKey }
  )

  // Record a pending charge row (the webhook flips it to succeeded + records
  // the transaction once the customer taps).
  await supabase.from('stripe_charges').insert({
    stripe_payment_intent_id: intent.id,
    booking_id: body.bookingId || null,
    customer_id: body.customerId || null,
    amount_cents: body.amountCents,
    currency: 'usd',
    status: 'pending',
    payment_method_type: 'stripe_terminal',
    reason: body.description.trim(),
    idempotency_key: idempotencyKey,
  })

  // Push it to the reader — customer taps/inserts now.
  try {
    await processOnReader(reader.id, intent.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reader error'
    return NextResponse.json(
      { success: false, error: `Reader error: ${message}`, paymentIntentId: intent.id },
      { status: 502 }
    )
  }

  return NextResponse.json({
    success: true,
    paymentIntentId: intent.id,
    readerId: reader.id,
    readerLabel: reader.label ?? reader.id,
  })
}
