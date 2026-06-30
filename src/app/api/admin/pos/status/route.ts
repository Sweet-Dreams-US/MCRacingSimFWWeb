// GET /api/admin/pos/status?paymentIntentId=pi_...
// The POS UI polls this while the customer is tapping the reader.
// Read-only: reports the PaymentIntent status. The actual recording
// (stripe_charges → succeeded + transaction insert) is done by the webhook.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }

  const paymentIntentId = request.nextUrl.searchParams.get('paymentIntentId')
  if (!paymentIntentId) {
    return NextResponse.json({ error: 'Missing paymentIntentId' }, { status: 400 })
  }

  const stripe = getStripe()
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)

  // Map Stripe's PI status to a simple POS state for the UI.
  //
  // IMPORTANT subtlety for Terminal/card_present: while the reader is still
  // collecting the card, the PaymentIntent sits in 'requires_payment_method'
  // (and briefly 'requires_confirmation') with NO last_payment_error. That is
  // NOT a failure — it just means the customer hasn't tapped yet, or the tap
  // is mid-flight. We must only treat it as failed when there's an actual
  // last_payment_error (a real decline) or the intent was canceled. (The
  // earlier version mapped 'requires_payment_method' straight to failed, which
  // flashed "declined" the instant polling started even though the charge then
  // succeeded.)
  let state: 'paid' | 'failed' | 'processing' | 'waiting'
  if (intent.status === 'succeeded') {
    state = 'paid'
  } else if (intent.status === 'canceled') {
    state = 'failed'
  } else if (intent.last_payment_error) {
    // A genuine decline: Stripe records the error and parks the PI back in
    // requires_payment_method.
    state = 'failed'
  } else if (intent.status === 'processing') {
    state = 'processing'
  } else {
    // requires_payment_method / requires_confirmation / requires_action with
    // no error → still collecting the card.
    state = 'waiting'
  }

  const tipCents =
    (intent.amount_details as { tip?: { amount?: number } } | undefined)?.tip
      ?.amount ?? 0

  return NextResponse.json({
    state,
    stripeStatus: intent.status,
    amountCents: intent.amount, // final total (incl. tip once selected)
    tipCents,
    lastError: intent.last_payment_error?.message ?? null,
  })
}
