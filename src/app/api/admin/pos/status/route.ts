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
  //   succeeded                          → paid
  //   requires_payment_method / canceled → failed (card declined / cancelled)
  //   processing                         → processing (captured, settling)
  //   anything else (requires_action…)   → waiting (customer hasn't tapped yet)
  let state: 'paid' | 'failed' | 'processing' | 'waiting'
  switch (intent.status) {
    case 'succeeded':
      state = 'paid'
      break
    case 'canceled':
    case 'requires_payment_method':
      state = 'failed'
      break
    case 'processing':
      state = 'processing'
      break
    default:
      state = 'waiting'
  }

  return NextResponse.json({
    state,
    stripeStatus: intent.status,
    amountCents: intent.amount,
    lastError: intent.last_payment_error?.message ?? null,
  })
}
