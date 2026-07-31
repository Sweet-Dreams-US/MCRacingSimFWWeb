// POST /api/terminal/send_receipt
//
// Send or re-send a receipt / thank-you from the on-reader POS — so staff can
// capture an email the customer gives at the counter (or fix a typo) without
// walking to a laptop.
//
// Accepts the same three handles as GET /api/terminal/receipts, because after a
// card sale the reader only holds a PaymentIntent id. Shares
// src/lib/receipts.ts with the admin panel so both send an identical receipt
// and log it identically.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'
import {
  sendTransactionEmail,
  resolveTransactionId,
  isReceiptKind,
  type ReceiptKind,
} from '@/lib/receipts'

export const runtime = 'nodejs'

interface Body {
  transactionId?: string | null
  paymentIntentId?: string | null
  bookingId?: string | null
  email?: string | null
  kind?: string
}

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const kind: ReceiptKind = isReceiptKind(body.kind) ? body.kind : 'receipt'
  const supabase = createAdminClient()

  const { id: transactionId } = await resolveTransactionId(supabase, {
    transactionId: body.transactionId,
    paymentIntentId: body.paymentIntentId,
    bookingId: body.bookingId,
  })

  if (!transactionId) {
    // Almost always the webhook still being in flight right after a tap.
    return NextResponse.json(
      {
        success: false,
        error: "This sale isn't recorded yet — wait a moment and try again.",
      },
      { status: 409 }
    )
  }

  const result = await sendTransactionEmail(supabase, {
    transactionId,
    kind,
    overrideEmail: body.email ?? null,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json({ success: true, sentTo: result.sentTo, transactionId })
}
