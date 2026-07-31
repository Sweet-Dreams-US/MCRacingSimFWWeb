// GET /api/terminal/receipts?transactionId=|paymentIntentId=|bookingId=
//
// "Was a receipt sent for this sale, and to whom?" — for the on-reader POS.
//
// The reader usually can't name the transaction directly: after a card sale it
// only holds a PaymentIntent id, and the transaction row is written
// asynchronously by the Stripe webhook. So this resolves any of three handles
// down to a transaction, and reports `pending: true` while the webhook hasn't
// landed yet, letting the reader poll and then show the real state.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'
import { listTransactionEmails, resolveTransactionId } from '@/lib/receipts'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const transactionId = url.searchParams.get('transactionId')?.trim() || null
  const paymentIntentId = url.searchParams.get('paymentIntentId')?.trim() || null
  const bookingId = url.searchParams.get('bookingId')?.trim() || null

  if (!transactionId && !paymentIntentId && !bookingId) {
    return NextResponse.json(
      { error: 'Pass transactionId, paymentIntentId or bookingId' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { id: resolvedId, pending } = await resolveTransactionId(supabase, {
    transactionId,
    paymentIntentId,
    bookingId,
  })

  if (!resolvedId) {
    // Not recorded yet (webhook in flight) — the reader keeps polling.
    return NextResponse.json({ transactionId: null, pending, receipts: [] })
  }

  const receipts = await listTransactionEmails(supabase, resolvedId)

  return NextResponse.json({
    transactionId: resolvedId,
    pending: false,
    receipts: receipts.map((r) => ({
      toEmail: r.toEmail,
      template: r.template,
      status: r.status,
      sentAt: r.sentAt,
      failed: r.status === 'failed' || r.status === 'skipped',
    })),
  })
}
