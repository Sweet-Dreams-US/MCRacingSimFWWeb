// POST /api/admin/bookings/[id]/charges/[chargeId]/retry
//
// Retry a previously-failed no-show charge. Creates a NEW PaymentIntent
// with a fresh idempotency key (so Stripe treats it as a new attempt,
// not a duplicate). Records the new attempt in stripe_charges; the old
// failed row is preserved as audit trail.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
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

  const { id: bookingId, chargeId } = await params
  const supabase = createAdminClient()

  // Pull the failed charge + its booking
  const { data: prevCharge, error: chargeError } = await supabase
    .from('stripe_charges')
    .select('*, booking:bookings(id, stripe_payment_method_id, customer_id, racer_count)')
    .eq('id', chargeId)
    .eq('booking_id', bookingId)
    .single()

  if (chargeError || !prevCharge) {
    return NextResponse.json(
      { success: false, error: 'Charge not found' },
      { status: 404 }
    )
  }

  if (prevCharge.status !== 'failed') {
    return NextResponse.json(
      { success: false, error: `Can only retry failed charges (this one is ${prevCharge.status})` },
      { status: 400 }
    )
  }

  const booking = Array.isArray(prevCharge.booking)
    ? prevCharge.booking[0]
    : prevCharge.booking
  if (!booking?.stripe_payment_method_id) {
    return NextResponse.json(
      { success: false, error: 'No card on file to retry against' },
      { status: 400 }
    )
  }

  // Get the Stripe Customer ID
  const { data: customer } = await supabase
    .from('customers')
    .select('stripe_customer_id')
    .eq('id', booking.customer_id)
    .single()
  if (!customer?.stripe_customer_id) {
    return NextResponse.json(
      { success: false, error: 'Customer missing Stripe Customer ID' },
      { status: 400 }
    )
  }

  // Compute attempt number for the idempotency key
  const { count: priorChargeCount } = await supabase
    .from('stripe_charges')
    .select('*', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
  const attempt = (priorChargeCount ?? 0) + 1
  const idempotencyKey = `noshow-${bookingId}-attempt-${attempt}`

  const stripe = getStripe()
  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: prevCharge.amount_cents,
        currency: 'usd',
        customer: customer.stripe_customer_id,
        payment_method: booking.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `Retry: ${prevCharge.reason}`,
        metadata: {
          booking_id: bookingId,
          retry_of_charge: chargeId,
          attempt: String(attempt),
        },
      },
      { idempotencyKey }
    )
  } catch (err) {
    const stripeErr = err as Stripe.errors.StripeCardError
    intent = stripeErr.payment_intent as Stripe.PaymentIntent
    if (!intent) {
      console.error('Retry failed without intent:', err)
      return NextResponse.json(
        { success: false, error: 'Card charge failed before reaching Stripe' },
        { status: 500 }
      )
    }
  }

  const chargeStatus =
    intent.status === 'succeeded'
      ? 'succeeded'
      : intent.status === 'requires_action'
        ? 'requires_action'
        : 'failed'

  // Insert new stripe_charges row for the retry attempt
  const { data: newCharge, error: insertError } = await supabase
    .from('stripe_charges')
    .insert({
      stripe_payment_intent_id: intent.id,
      booking_id: bookingId,
      customer_id: booking.customer_id,
      amount_cents: prevCharge.amount_cents,
      currency: 'usd',
      status: chargeStatus,
      payment_method_type: 'stripe_online',
      stripe_payment_method_id: booking.stripe_payment_method_id,
      decline_code: intent.last_payment_error?.decline_code ?? null,
      failure_message: intent.last_payment_error?.message ?? null,
      reason: `Retry of charge ${chargeId} — ${prevCharge.reason}`,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  if (insertError || !newCharge) {
    console.error('Failed to record retry charge:', insertError)
    return NextResponse.json(
      {
        success: chargeStatus === 'succeeded',
        warning: 'Charge attempted but record insert failed. Check Stripe dashboard.',
      },
      { status: 500 }
    )
  }

  // Insert transaction on success (same pattern as initial no-show)
  if (chargeStatus === 'succeeded') {
    const todayEastern = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

    await supabase.from('transactions').insert({
      type: 'no_show_fee',
      amount_cents: prevCharge.amount_cents,
      occurred_on: todayEastern,
      description: `No-show fee (retry) — booking ${bookingId}`,
      booking_id: bookingId,
      customer_id: booking.customer_id,
      stripe_charge_id: newCharge.id,
      payment_method: 'stripe_online',
      created_by_user_id: adminCtx.admin.id,
    })
  }

  return NextResponse.json({
    success: chargeStatus === 'succeeded',
    chargeStatus,
    chargeId: newCharge.id,
    declineCode: intent.last_payment_error?.decline_code ?? null,
    failureMessage: intent.last_payment_error?.message ?? null,
  })
}
