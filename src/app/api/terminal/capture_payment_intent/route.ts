// POST /api/terminal/capture_payment_intent
// Capture a manual-capture card-present PaymentIntent after the device has
// collected + confirmed it (final amount includes the on-reader tip). The
// stripe webhook (payment_intent.succeeded, source=pos) records the transaction.
import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { paymentIntentId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = (body.paymentIntentId ?? '').trim()
  if (!id) {
    return NextResponse.json({ error: 'paymentIntentId is required' }, { status: 400 })
  }

  try {
    const stripe = getStripe()
    const pi = await stripe.paymentIntents.capture(id)
    return NextResponse.json({
      paymentIntentId: pi.id,
      secret: pi.client_secret,
      amountCents: pi.amount,
      status: pi.status,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Capture failed' },
      { status: 502 }
    )
  }
}
