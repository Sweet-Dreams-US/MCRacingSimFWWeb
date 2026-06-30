// /admin/customers/[id] — customer detail page.
// Shows contact info, lifetime stats, and complete booking history.
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookingStatusBadge } from '../../../StatusBadge'
import SendEmailToCustomer from './SendEmailToCustomer'

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!customer) {
    notFound()
  }

  // Fetch all bookings for this customer
  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, session_date, start_time, duration_hours, racer_count, session_price_cents, status, source, created_at'
    )
    .eq('customer_id', id)
    .order('session_date', { ascending: false })

  // Fetch all transactions for this customer (income from this customer)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, type, amount_cents, occurred_on, description, payment_method')
    .eq('customer_id', id)
    .is('soft_deleted_at', null)
    .order('occurred_on', { ascending: false })
    .limit(50)

  const totalSpentCents = (transactions ?? []).reduce(
    (sum, t) => sum + (t.amount_cents > 0 ? t.amount_cents : 0),
    0
  )

  // Can we email this customer? Mirrors the suppression rules in the send
  // engine so the owner sees the same answer the system would enforce.
  let emailable = true
  let suppressionReason: string | null = null
  if (!customer.email) {
    emailable = false
    suppressionReason = 'No email address on file.'
  } else if (customer.email_complained_at) {
    emailable = false
    suppressionReason = 'Marked a previous email as spam — permanently suppressed.'
  } else if (customer.unsubscribed_at) {
    emailable = false
    suppressionReason = 'Unsubscribed from marketing.'
  } else if (customer.email_bounced_at) {
    emailable = false
    suppressionReason = 'Email address bounced — suppressed.'
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <Link
          href="/admin/customers"
          className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
        >
          ← Back to customers
        </Link>
        <h1 className="racing-headline text-3xl text-grid-white mt-2">
          {customer.first_name} {customer.last_name}
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Customer since {formatDateTime(customer.created_at)}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Lifetime Bookings"
          value={String(bookings?.length ?? 0)}
          accent="cyan"
        />
        <StatCard
          label="Lifetime Spent"
          value={formatDollars(totalSpentCents)}
          accent="red"
        />
        <StatCard
          label="Card on File"
          value={customer.stripe_customer_id ? 'Yes' : 'No'}
          accent={customer.stripe_customer_id ? 'green' : 'gray'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact info */}
        <div className="space-y-6">
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">Contact</h2>
            <div className="space-y-3">
              <Field label="Email" value={customer.email ?? '—'} />
              <Field label="Phone" value={customer.phone ?? '—'} />
              <Field
                label="Birthday"
                value={customer.birthday ? formatDate(customer.birthday) : '—'}
              />
              <Field label="How heard" value={customer.how_heard ?? '—'} />
              <Field
                label="Email marketing"
                value={emailable ? '✓ Can email' : suppressionReason ?? 'Suppressed'}
              />
              {customer.stripe_customer_id && (
                <Field label="Stripe ID" value={customer.stripe_customer_id} mono />
              )}
            </div>
          </div>

          <SendEmailToCustomer
            customerId={customer.id}
            firstName={customer.first_name}
            emailable={emailable}
            suppressionReason={suppressionReason}
          />
        </div>

        {/* Right: Bookings + transactions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-asphalt-dark border border-white/5 p-6">
            <h2 className="racing-headline text-lg text-grid-white mb-4">
              Bookings <span className="text-pit-gray">({bookings?.length ?? 0})</span>
            </h2>
            {!bookings || bookings.length === 0 ? (
              <p className="telemetry-text text-pit-gray">No bookings yet.</p>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <Link
                    key={b.id}
                    href={`/admin/bookings/${b.id}`}
                    className="block bg-asphalt border border-white/5 hover:border-apex-red/30 transition-colors p-3"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="telemetry-text text-grid-white">
                          {formatDate(b.session_date)} • {formatTime(b.start_time)}
                        </p>
                        <p className="telemetry-text text-xs text-pit-gray mt-0.5">
                          {b.id} • {b.racer_count} racer{b.racer_count > 1 ? 's' : ''} •{' '}
                          {b.duration_hours}h
                        </p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <BookingStatusBadge status={b.status} />
                        <span className="telemetry-text text-xs text-pit-gray">
                          {formatDollars(b.session_price_cents)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {transactions && transactions.length > 0 && (
            <div className="bg-asphalt-dark border border-white/5 p-6">
              <h2 className="racing-headline text-lg text-grid-white mb-4">
                Transactions <span className="text-pit-gray">({transactions.length})</span>
              </h2>
              <div className="space-y-2">
                {transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex justify-between items-start py-2 border-b border-white/5 last:border-b-0"
                  >
                    <div>
                      <p className="telemetry-text text-sm text-grid-white">
                        {t.description}
                      </p>
                      <p className="telemetry-text text-xs text-pit-gray">
                        {formatDate(t.occurred_on)} • {t.type.replace(/_/g, ' ')} •{' '}
                        {t.payment_method.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span
                      className={`telemetry-text font-bold ${
                        t.amount_cents >= 0 ? 'text-green-400' : 'text-apex-red'
                      }`}
                    >
                      {t.amount_cents >= 0 ? '+' : ''}
                      {formatDollars(t.amount_cents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p
        className={`${mono ? 'font-mono text-xs' : 'telemetry-text text-sm'} text-grid-white break-all`}
      >
        {value}
      </p>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'cyan' | 'red' | 'green' | 'gray'
}) {
  const accentClass = {
    cyan: 'text-telemetry-cyan',
    red: 'text-apex-red',
    green: 'text-green-400',
    gray: 'text-pit-gray',
  }[accent]
  return (
    <div className="bg-asphalt-dark border border-white/5 p-6">
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
        {label}
      </p>
      <p className={`racing-headline text-3xl ${accentClass} mt-2`}>{value}</p>
    </div>
  )
}
