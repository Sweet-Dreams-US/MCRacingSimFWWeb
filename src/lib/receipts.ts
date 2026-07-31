// Transaction receipt / thank-you emails — the single code path shared by the
// admin panel (/api/admin/transactions/[id]/email) and the on-reader POS
// (/api/terminal/send_receipt). Keeping one implementation means the reader and
// the web panel can never drift on who gets mailed, what the receipt says, or
// what gets written to email_log.
import type { createAdminClient } from './supabase/admin'
import { sendEmail } from './email'
import { transactionReceiptEmail, sessionThankYouEmail } from './emails/templates'
import { formatTransactionType, GROSS_INCOME_TYPES } from './accounting'
import { taxRateLabel } from './tax'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

/** Transaction types a customer receipt can legitimately describe. */
const RECEIPTABLE_TYPES = [...GROSS_INCOME_TYPES]

export type ReceiptKind = 'receipt' | 'thankyou'

export function isReceiptKind(s: unknown): s is ReceiptKind {
  return s === 'receipt' || s === 'thankyou'
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  stripe_online: 'Card (online)',
  stripe_terminal: 'Card (in person)',
  cash: 'Cash',
  other: 'Other',
  internal: 'Internal',
}

export function paymentMethodLabel(m: string): string {
  return PAYMENT_METHOD_LABELS[m] ?? 'Card'
}

/** One previously-sent email for a transaction, as the UIs render it. */
export interface ReceiptLogEntry {
  id: string
  toEmail: string
  template: string
  status: string
  sentAt: string
  error: string | null
}

/** The handles a caller might hold for a sale. */
export interface TransactionHandles {
  transactionId?: string | null
  paymentIntentId?: string | null
  bookingId?: string | null
}

export interface ResolvedTransaction {
  id: string | null
  /** A handle was given but the sale isn't recorded yet (webhook still in flight). */
  pending: boolean
}

/**
 * Resolve whichever handle the caller holds down to one transaction.
 *
 * The handles are EXCLUSIVE, not a cascade. If a paymentIntentId was supplied
 * but hasn't resolved yet, we report `pending` — we must NOT quietly fall back
 * to "the newest transaction on that booking", which on a multi-payment booking
 * is a different sale entirely and would show (or email) the wrong amount to
 * the wrong person.
 *
 * Refund rows share stripe_charge_id and booking_id with the sale they reverse,
 * so every lookup filters to money-in types and orders deterministically rather
 * than using maybeSingle() (which errors outright once two rows match).
 */
export async function resolveTransactionId(
  supabase: SupabaseAdmin,
  handles: TransactionHandles
): Promise<ResolvedTransaction> {
  const transactionId = handles.transactionId?.trim() || null
  const paymentIntentId = handles.paymentIntentId?.trim() || null
  const bookingId = handles.bookingId?.trim() || null

  if (transactionId) return { id: transactionId, pending: false }

  if (paymentIntentId) {
    const { data: charge } = await supabase
      .from('stripe_charges')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (!charge) return { id: null, pending: true }

    // Oldest money-in row for this charge = the original sale, not a later refund.
    const { data } = await supabase
      .from('transactions')
      .select('id')
      .eq('stripe_charge_id', charge.id)
      .is('soft_deleted_at', null)
      .in('type', RECEIPTABLE_TYPES)
      .order('created_at', { ascending: true })
      .limit(1)
    const id = data?.[0]?.id ?? null
    return { id, pending: id === null }
  }

  if (bookingId) {
    const { data } = await supabase
      .from('transactions')
      .select('id')
      .eq('booking_id', bookingId)
      .is('soft_deleted_at', null)
      .in('type', RECEIPTABLE_TYPES)
      .order('created_at', { ascending: false })
      .limit(1)
    const id = data?.[0]?.id ?? null
    return { id, pending: id === null }
  }

  return { id: null, pending: false }
}

export type SendTransactionEmailResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; status: number }

/**
 * Send (or re-send) a receipt / thank-you for a transaction.
 *
 * Recipient precedence:
 *   1. `overrideEmail` — an address typed at the point of sale. Wins, because
 *      staff type it precisely when the payer is not the customer on file.
 *   2. The connected customer's email.
 *
 * Records the send against the transaction in email_log so both UIs can show
 * "receipt sent, to whom, when".
 */
export async function sendTransactionEmail(
  supabase: SupabaseAdmin,
  opts: {
    transactionId: string
    kind: ReceiptKind
    overrideEmail?: string | null
  }
): Promise<SendTransactionEmailResult> {
  const { transactionId, kind } = opts
  const override = opts.overrideEmail?.trim() || null

  if (override && !override.includes('@')) {
    return { ok: false, error: 'That email address is not valid.', status: 400 }
  }

  const { data: txn } = await supabase
    .from('transactions')
    .select(
      'id, amount_cents, tip_cents, tax_cents, description, occurred_on, payment_method, type, booking_id, soft_deleted_at, customer:customers(id, first_name, email)'
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (!txn || txn.soft_deleted_at) {
    return { ok: false, error: 'Transaction not found', status: 404 }
  }

  // A refund / expense / payout row must never be mailed as a receipt: the
  // template is headed "Thanks for racing" and formats the amount as a total,
  // so a -$50 refund would reach the customer as a bizarre negative receipt.
  if (txn.amount_cents <= 0 || !RECEIPTABLE_TYPES.includes(txn.type)) {
    return {
      ok: false,
      error: 'Receipts can only be sent for payments — not refunds, expenses or payouts.',
      status: 400,
    }
  }

  const customer = Array.isArray(txn.customer) ? txn.customer[0] : txn.customer
  const to = override || customer?.email || null

  if (!to) {
    return {
      ok: false,
      error:
        'No email address for this sale. Connect a customer with an email, or enter one to send to.',
      status: 400,
    }
  }

  // Only greet by name when mailing that customer's own address — otherwise a
  // receipt sent to a different payer would be addressed to the wrong person.
  const nameMatches =
    customer?.email != null && customer.email.toLowerCase() === to.toLowerCase()
  const firstName = (nameMatches ? customer?.first_name : null) || 'racer'

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
          paymentMethodLabel: paymentMethodLabel(txn.payment_method),
          typeLabel: formatTransactionType(txn.type),
          taxRateLabel: (txn.tax_cents ?? 0) > 0 ? taxRateLabel() : undefined,
        })

  const messageId = await sendEmail({
    to,
    subject,
    html,
    template: kind === 'thankyou' ? 'session_thankyou' : 'transaction_receipt',
    relatedBookingId: txn.booking_id,
    relatedCustomerId: customer?.id ?? null,
    relatedTransactionId: txn.id,
  })

  // sendEmail returns null when Resend isn't configured, or on a logged failure.
  if (!messageId) {
    return {
      ok: false,
      error: 'Email could not be sent (check email configuration / logs).',
      status: 502,
    }
  }

  return { ok: true, sentTo: to }
}

/** Emails already sent for a transaction, newest first. */
export async function listTransactionEmails(
  supabase: SupabaseAdmin,
  transactionId: string,
  limit = 10
): Promise<ReceiptLogEntry[]> {
  const { data } = await supabase
    .from('email_log')
    .select('id, to_email, template, status, sent_at, error')
    .eq('related_transaction_id', transactionId)
    .order('sent_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => ({
    id: r.id,
    toEmail: r.to_email,
    template: r.template,
    status: r.status,
    sentAt: r.sent_at,
    error: r.error,
  }))
}
