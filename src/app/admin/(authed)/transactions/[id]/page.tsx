// /admin/transactions/[id] — single transaction detail.
//
// Fixes the list's rows that linked here to a non-existent page (404). Shows
// the full record, the linked booking (if any), and a customer panel that can
// connect/change/detach a customer and resend a receipt or thank-you.
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentMethodBadge } from '../../../StatusBadge'
import { formatDate, formatDollars, formatTransactionType } from '@/lib/accounting'
import { listTransactionEmails } from '@/lib/receipts'
import TransactionCustomerPanel from './TransactionCustomerPanel'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-3 border-b border-white/5 last:border-b-0">
      <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span className="telemetry-text text-sm text-grid-white text-right break-words min-w-0">{children}</span>
    </div>
  )
}

function fullName(c: { first_name: string | null; last_name: string | null } | null): string {
  if (!c) return ''
  return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
}

const EMAIL_TEMPLATE_LABELS: Record<string, string> = {
  transaction_receipt: 'Receipt',
  session_thankyou: 'Thank-you',
}

function emailTemplateLabel(t: string): string {
  return EMAIL_TEMPLATE_LABELS[t] ?? t.replace(/_/g, ' ')
}

/** When the email actually went out, in venue-local terms. */
function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// 'sent' means Resend accepted it. 'failed'/'skipped' mean it never left. Once
// the Resend webhook mirrors delivery events into email_log, 'delivered' /
// 'bounced' will flow through here too without further changes.
function emailStatusStyle(status: string): { dot: string; text: string; label: string } {
  switch (status) {
    case 'failed':
      return { dot: 'bg-apex-red', text: 'text-apex-red', label: 'Failed' }
    case 'skipped':
      return { dot: 'bg-amber-400', text: 'text-amber-400', label: 'Not sent' }
    case 'bounced':
      return { dot: 'bg-apex-red', text: 'text-apex-red', label: 'Bounced' }
    case 'delivered':
      return { dot: 'bg-green-400', text: 'text-green-400', label: 'Delivered' }
    default:
      return { dot: 'bg-green-400', text: 'text-green-400', label: 'Sent' }
  }
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data: t } = await supabase
    .from('transactions')
    .select(
      `id, occurred_on, created_at, type, description, payment_method, amount_cents,
       tip_cents, tax_cents, vendor, receipt_url, stripe_charge_id, booking_id, customer_id,
       soft_deleted_at,
       customer:customers(id, first_name, last_name, email, phone),
       booking:bookings(id, session_date, start_time, customer:customers(id, first_name, last_name, email))`
    )
    .eq('id', id)
    .maybeSingle()

  if (!t || t.soft_deleted_at) notFound()

  // Every receipt / thank-you already sent for this sale.
  const emails = await listTransactionEmails(supabase, t.id)
  const SENT_STATUSES = ['sent', 'delivered', 'opened', 'clicked']
  const sentReceiptCount = emails.filter(
    (e) => e.template === 'transaction_receipt' && SENT_STATUSES.includes(e.status)
  ).length

  const customer = Array.isArray(t.customer) ? t.customer[0] : t.customer
  const booking = Array.isArray(t.booking) ? t.booking[0] : t.booking
  const bookingCustomerRaw = booking
    ? Array.isArray(booking.customer)
      ? booking.customer[0]
      : booking.customer
    : null

  const isPositive = t.amount_cents >= 0

  // The booking's customer, offered as a one-click "connect" when it differs
  // from (or fills in) the transaction's current customer.
  const bookingCustomer =
    bookingCustomerRaw && bookingCustomerRaw.id !== customer?.id
      ? {
          id: bookingCustomerRaw.id,
          name: fullName(bookingCustomerRaw) || bookingCustomerRaw.email || 'Customer',
          email: bookingCustomerRaw.email,
        }
      : null

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl mx-auto space-y-6">
      <Link
        href="/admin/transactions"
        className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
      >
        ← Back to Transactions
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
            // {formatTransactionType(t.type)}
          </p>
          <h1
            className={`racing-headline text-4xl ${isPositive ? 'text-green-400' : 'text-apex-red'}`}
          >
            {formatDollars(t.amount_cents)}
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">{formatDate(t.occurred_on)}</p>
        </div>
        <PaymentMethodBadge method={t.payment_method} />
      </header>

      {/* Details */}
      <div className="bg-asphalt-dark border border-white/5 p-5">
        <DetailRow label="Description">{t.description || '—'}</DetailRow>
        <DetailRow label="Type">{formatTransactionType(t.type)}</DetailRow>
        {t.tax_cents > 0 && (
          <DetailRow label="Sales tax included">{formatDollars(t.tax_cents)}</DetailRow>
        )}
        {t.tip_cents > 0 && <DetailRow label="Tip included">{formatDollars(t.tip_cents)}</DetailRow>}
        {t.vendor && <DetailRow label="Vendor">{t.vendor}</DetailRow>}
        {booking && (
          <DetailRow label="Linked booking">
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="text-telemetry-cyan hover:text-telemetry-cyan-glow"
            >
              {booking.id}
            </Link>
          </DetailRow>
        )}
        {t.receipt_url && (
          <DetailRow label="Receipt file">
            <a
              href={t.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-telemetry-cyan hover:text-telemetry-cyan-glow"
            >
              View
            </a>
          </DetailRow>
        )}
        {t.stripe_charge_id && <DetailRow label="Stripe charge">{t.stripe_charge_id}</DetailRow>}
        <DetailRow label="Recorded">{formatDate(t.created_at)}</DetailRow>
      </div>

      {/* Receipt history — only meaningful for money-in rows */}
      {isPositive && (
        <div className="bg-asphalt-dark border border-white/5 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="racing-headline text-sm text-grid-white uppercase tracking-wider">
              Receipts
            </h2>
            {/* Count only receipts that actually left — a failed or skipped
                row, or a thank-you, must not read as "receipt sent". */}
            {sentReceiptCount > 0 ? (
              <span className="telemetry-text text-xs text-green-400">
                {sentReceiptCount} sent
              </span>
            ) : (
              <span className="telemetry-text text-xs text-amber-400">None sent</span>
            )}
          </div>

          {emails.length === 0 ? (
            <p className="telemetry-text text-sm text-amber-400">
              No receipt has been sent for this sale.
              {customer?.email
                ? ' Use Resend Receipt below to send one.'
                : ' Connect a customer with an email, or send to a one-off address below.'}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {emails.map((e) => {
                const s = emailStatusStyle(e.status)
                return (
                  <li key={e.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="telemetry-text text-sm text-grid-white">
                          {emailTemplateLabel(e.template)}{' '}
                          <span className="text-pit-gray">→ {e.toEmail}</span>
                        </p>
                        {e.error && (
                          <p className="telemetry-text text-xs text-apex-red mt-1">{e.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        <span className={`telemetry-text text-xs ${s.text}`}>{s.label}</span>
                        <span className="telemetry-text text-xs text-pit-gray">
                          {formatSentAt(e.sentAt)}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Customer connect + resend */}
      <TransactionCustomerPanel
        transactionId={t.id}
        initialCustomer={
          customer
            ? {
                id: customer.id,
                name: fullName(customer) || customer.email || 'Customer',
                email: customer.email,
              }
            : null
        }
        bookingCustomer={bookingCustomer}
      />
    </div>
  )
}
