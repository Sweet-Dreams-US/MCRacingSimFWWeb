// POST /api/admin/transactions/[id]/email
// Resend a receipt or a thank-you for a transaction. Optionally to a one-off
// address (`email`) when the payer isn't the customer on file.
//
// The actual work lives in src/lib/receipts.ts, shared with the on-reader POS
// (/api/terminal/send_receipt) so the two can't drift.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionEmail, type ReceiptKind } from '@/lib/receipts'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const { id } = await params
  let kind: ReceiptKind = 'receipt'
  let email: string | null = null
  try {
    const body = (await request.json()) as { kind?: string; email?: string }
    kind = body.kind === 'thankyou' ? 'thankyou' : 'receipt'
    email = body.email?.trim() || null
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await sendTransactionEmail(createAdminClient(), {
    transactionId: id,
    kind,
    overrideEmail: email,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json({ success: true, sentTo: result.sentTo })
}
