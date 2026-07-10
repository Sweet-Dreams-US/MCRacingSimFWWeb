// POST /api/admin/transactions/[id]/email
// Resend a receipt or a thank-you for a transaction to its connected customer.
// Requires the transaction to have a customer_id whose customer has an email.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { transactionReceiptEmail, sessionThankYouEmail } from '@/lib/emails/templates'
import { formatTransactionType } from '@/lib/accounting'
import { taxRateLabel } from '@/lib/tax'

export const runtime = 'nodejs'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe_online: 'Card (online)',
  stripe_terminal: 'Card (in person)',
  cash: 'Cash',
  other: 'Other',
  internal: 'Internal',
}

function methodLabel(m: string): string {
  return PAYMENT_METHOD_LABELS[m] ?? 'Card'
}

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
  let kind: 'receipt' | 'thankyou' = 'receipt'
  try {
    const body = (await request.json()) as { kind?: string }
    kind = body.kind === 'thankyou' ? 'thankyou' : 'receipt'
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: txn } = await supabase
    .from('transactions')
    .select(
      'id, amount_cents, tip_cents, tax_cents, description, occurred_on, payment_method, type, booking_id, customer:customers(id, first_name, email)'
    )
    .eq('id', id)
    .maybeSingle()

  if (!txn) {
    return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
  }

  const customer = Array.isArray(txn.customer) ? txn.customer[0] : txn.customer
  if (!customer || !customer.email) {
    return NextResponse.json(
      { success: false, error: 'This transaction has no customer with an email on file. Connect a customer first.' },
      { status: 400 }
    )
  }

  const firstName = customer.first_name || 'racer'

  const { subject, html } =
    kind === 'thankyou'
      ? sessionThankYouEmail({ customerFirstName: firstName })
      : transactionReceiptEmail({
          customerFirstName: firstName,
          description: txn.description,
          amountCents: txn.amount_cents,
          taxCents: txn.tax_cents ?? 0,
          tipCents: txn.tip_cents ?? 0,
          occurredOn: txn.occurred_on,
          paymentMethodLabel: methodLabel(txn.payment_method),
          typeLabel: formatTransactionType(txn.type),
          taxRateLabel: (txn.tax_cents ?? 0) > 0 ? taxRateLabel() : undefined,
        })

  const messageId = await sendEmail({
    to: customer.email,
    subject,
    html,
    template: kind === 'thankyou' ? 'session_thankyou' : 'transaction_receipt',
    relatedBookingId: txn.booking_id,
    relatedCustomerId: customer.id,
  })

  // sendEmail returns null when Resend isn't configured (or on a logged failure).
  if (!messageId) {
    return NextResponse.json(
      { success: false, error: 'Email could not be sent (check email configuration / logs).' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, sentTo: customer.email })
}
