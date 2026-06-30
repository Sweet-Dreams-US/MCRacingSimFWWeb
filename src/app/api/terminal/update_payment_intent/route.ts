// POST /api/terminal/update_payment_intent
// Attach/replace the receipt email on a PaymentIntent before capture.
import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { paymentIntentId?: string; receiptEmail?: string | null }
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
    const pi = await stripe.paymentIntents.update(id, {
      receipt_email: body.receiptEmail?.trim() || undefined,
    })
    return NextResponse.json({ paymentIntentId: pi.id, secret: pi.client_secret })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 502 }
    )
  }
}
