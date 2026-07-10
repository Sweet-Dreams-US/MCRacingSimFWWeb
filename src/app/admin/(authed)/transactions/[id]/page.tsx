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
import TransactionCustomerPanel from './TransactionCustomerPanel'

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-3 border-b border-white/5 last:border-b-0">
      <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider shrink-0">
        {label}
      </span>
      <span className="telemetry-text text-sm text-grid-white text-right break-words">{children}</span>
    </div>
  )
}

function fullName(c: { first_name: string | null; last_name: string | null } | null): string {
  if (!c) return ''
  return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim()
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
       tip_cents, vendor, receipt_url, stripe_charge_id, booking_id, customer_id,
       soft_deleted_at,
       customer:customers(id, first_name, last_name, email, phone),
       booking:bookings(id, session_date, start_time, customer:customers(id, first_name, last_name, email))`
    )
    .eq('id', id)
    .maybeSingle()

  if (!t || t.soft_deleted_at) notFound()

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
