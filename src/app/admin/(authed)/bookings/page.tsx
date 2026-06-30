// /admin/bookings — list of upcoming + recent bookings.
// Server component: queries Supabase directly with the service-role client
// (the auth gate runs in the parent (authed) layout, but we still verify
// with requireAdmin for defense-in-depth).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookingStatusBadge } from '../../StatusBadge'

interface BookingRow {
  id: string
  session_date: string
  start_time: string
  duration_hours: number
  racer_count: number
  session_price_cents: number
  no_show_fee_cents: number
  status: 'pending' | 'confirmed' | 'completed' | 'partial_noshow' | 'noshow' | 'cancelled'
  source: 'online' | 'admin' | 'imported'
  stripe_payment_method_id: string | null
  customer: { first_name: string; last_name: string; email: string; phone: string | null } | null
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(t: string): string {
  // "14:30:00" → "2:30 PM"
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getTodayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export default async function BookingsPage() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const today = getTodayEastern()

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      `
      id, session_date, start_time, duration_hours, racer_count,
      session_price_cents, no_show_fee_cents, status, source,
      stripe_payment_method_id,
      customer:customers(first_name, last_name, email, phone)
    `
    )
    .gte('session_date', today)
    // Exclude 'pending' bookings — those are incomplete (customer started a
    // booking but never saved a card). They become 'confirmed' only once the
    // card is on file, so the list shows real bookings only.
    .neq('status', 'pending')
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(100)

  if (error) {
    return (
      <div className="bg-apex-red/10 border border-apex-red/30 p-4">
        <p className="telemetry-text text-apex-red">Failed to load bookings: {error.message}</p>
      </div>
    )
  }

  // The Supabase types return customer as an array; normalize to single object
  const rows: BookingRow[] = (bookings ?? []).map((b) => ({
    ...b,
    customer: Array.isArray(b.customer) ? (b.customer[0] ?? null) : b.customer,
  }))

  const todayBookings = rows.filter((r) => r.session_date === today)
  const futureBookings = rows.filter((r) => r.session_date > today)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="racing-headline text-3xl text-grid-white">Bookings</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {rows.length} upcoming session{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/admin/bookings/new"
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-5 py-3 transition-colors"
        >
          + Invite to Booking
        </Link>
      </div>

      {/* Today */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="racing-headline text-xl text-grid-white">
            Today <span className="text-pit-gray">({todayBookings.length})</span>
          </h2>
          <p className="telemetry-text text-xs text-pit-gray">{formatDate(today)}</p>
        </div>
        {todayBookings.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">No bookings for today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayBookings.map((b) => (
              <BookingRowCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section>
        <h2 className="racing-headline text-xl text-grid-white mb-4">
          Upcoming <span className="text-pit-gray">({futureBookings.length})</span>
        </h2>
        {futureBookings.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">No upcoming bookings.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {futureBookings.map((b) => (
              <BookingRowCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BookingRowCard({ b }: { b: BookingRow }) {
  const customerName = b.customer
    ? `${b.customer.first_name} ${b.customer.last_name}`
    : '(no customer)'
  const cardOnFile = Boolean(b.stripe_payment_method_id)

  return (
    <Link
      href={`/admin/bookings/${b.id}`}
      className="block bg-asphalt-dark border border-white/5 hover:border-apex-red/50 transition-colors p-4"
    >
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* Time */}
        <div className="col-span-12 sm:col-span-2">
          <p className="telemetry-text text-xs text-pit-gray">{formatDate(b.session_date)}</p>
          <p className="racing-headline text-lg text-grid-white">{formatTime(b.start_time)}</p>
          <p className="telemetry-text text-xs text-pit-gray">
            {b.duration_hours}h • {b.racer_count} racer{b.racer_count > 1 ? 's' : ''}
          </p>
        </div>

        {/* Customer */}
        <div className="col-span-12 sm:col-span-4">
          <p className="telemetry-text text-grid-white">{customerName}</p>
          <p className="telemetry-text text-xs text-pit-gray">{b.customer?.email}</p>
          {b.customer?.phone && (
            <p className="telemetry-text text-xs text-pit-gray">{b.customer.phone}</p>
          )}
        </div>

        {/* Money */}
        <div className="col-span-6 sm:col-span-2">
          <p className="telemetry-text text-xs text-pit-gray">Session</p>
          <p className="telemetry-text text-grid-white">{formatDollars(b.session_price_cents)}</p>
          <p className="telemetry-text text-xs text-apex-red">
            No-show: {formatDollars(b.no_show_fee_cents)}
          </p>
        </div>

        {/* Status badges */}
        <div className="col-span-6 sm:col-span-3 flex flex-wrap gap-1">
          <BookingStatusBadge status={b.status} />
          {!cardOnFile && b.source === 'online' && (
            <span className="telemetry-text text-xs px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              No card on file
            </span>
          )}
          {b.source === 'admin' && (
            <span className="telemetry-text text-xs px-2 py-0.5 bg-white/5 text-pit-gray border border-white/10 uppercase tracking-wider">
              Walk-in / Phone
            </span>
          )}
        </div>

        {/* Chevron */}
        <div className="hidden sm:flex sm:col-span-1 justify-end">
          <svg
            className="w-5 h-5 text-pit-gray"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  )
}
