// /admin/bookings — list of upcoming + recent bookings.
// Server component: queries Supabase directly with the service-role client
// (the auth gate runs in the parent (authed) layout, but we still verify
// with requireAdmin for defense-in-depth).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessDateEastern, addDaysISO } from '@/lib/business-day'
import { toExtendedMinutes } from '@/lib/availability'
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
  card_link_token: string | null
  customer: { first_name: string; last_name: string; email: string | null; phone: string | null } | null
}

// Staff-set availability block ("personal appointment" / closure). Shows in the
// schedule flagged and distinct from a real booking, and is mirrored to Google
// Calendar. A null start/end means the whole day is blocked.
interface BlockItem {
  id: string
  block_date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
}

// One day's schedule interleaves real bookings and blocks. Sorted by DATE first
// (so the multi-day "Upcoming" bucket stays chronological / grouped by day),
// then by start time on the venue's noon→2am axis (a whole-day block sorts to
// the top of its own date). `pred` selects which dates fall in this bucket
// (today / tomorrow / future).
type ScheduleEntry =
  | { kind: 'booking'; date: string; sort: number; row: BookingRow }
  | { kind: 'block'; date: string; sort: number; block: BlockItem }

function startSortMinutes(t: string | null): number {
  if (!t) return -1 // whole-day block: sort ahead of every timed entry (same date)
  // Extended-minutes axis (pre-noon = late-night tail, +24h) so a 1 AM session
  // sorts to the END of the noon→2am business day, not the top.
  return toExtendedMinutes(t)
}

function daySchedule(
  bookings: BookingRow[],
  blocks: BlockItem[],
  pred: (date: string) => boolean
): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [
    ...bookings
      .filter((r) => pred(r.session_date))
      .map((row) => ({
        kind: 'booking' as const,
        date: row.session_date,
        sort: startSortMinutes(row.start_time),
        row,
      })),
    ...blocks
      .filter((b) => pred(b.block_date))
      .map((block) => ({
        kind: 'block' as const,
        date: block.block_date,
        sort: startSortMinutes(block.start_time),
        block,
      })),
  ]
  // ISO date strings sort lexicographically = chronologically; ties broken by
  // start time. Without the date key, Upcoming would interleave days by clock
  // time (e.g. a later day's afternoon above an earlier day's evening).
  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sort - b.sort))
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

export default async function BookingsPage() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const today = businessDateEastern() // rolls over at 7am so late-night stays "today"
  const tomorrow = addDaysISO(today, 1)

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      `
      id, session_date, start_time, duration_hours, racer_count,
      session_price_cents, no_show_fee_cents, status, source,
      stripe_payment_method_id, card_link_token,
      customer:customers(first_name, last_name, email, phone)
    `
    )
    .gte('session_date', today)
    // Fetch everything upcoming, including incomplete online bookings (pending,
    // no card) and require-card invites — we split them out below so the owner
    // can still SEE the incomplete ones (to follow up) without cluttering the
    // main Today/Tomorrow/Upcoming lists.
    .neq('status', 'cancelled')
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(150)

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

  // Availability blocks = staff-set "personal appointments" / closures. They
  // show here flagged (and on the Google Calendar), interleaved with bookings.
  const { data: blockData } = await supabase
    .from('availability_blocks')
    .select('id, block_date, start_time, end_time, reason')
    .gte('block_date', today)
  const blocks: BlockItem[] = blockData ?? []

  // Incomplete = a customer started an online booking but never saved a card
  // (pending, no require-card link). Kept out of the main lists, shown at the
  // bottom so the owner can follow up or clean them up.
  const isIncomplete = (r: BookingRow) => r.status === 'pending' && !r.card_link_token
  const incompleteBookings = rows.filter(isIncomplete)
  const active = rows.filter((r) => !isIncomplete(r))

  const todayItems = daySchedule(active, blocks, (d) => d === today)
  const tomorrowItems = daySchedule(active, blocks, (d) => d === tomorrow)
  const futureItems = daySchedule(active, blocks, (d) => d > tomorrow)

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
            Today <span className="text-pit-gray">({todayItems.length})</span>
          </h2>
          <p className="telemetry-text text-xs text-pit-gray">{formatDate(today)}</p>
        </div>
        {todayItems.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">Nothing on the schedule today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayItems.map((e) =>
              e.kind === 'booking' ? (
                <BookingRowCard key={e.row.id} b={e.row} />
              ) : (
                <BlockRowCard key={e.block.id} block={e.block} />
              )
            )}
          </div>
        )}
      </section>

      {/* Tomorrow */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="racing-headline text-xl text-grid-white">
            Tomorrow <span className="text-pit-gray">({tomorrowItems.length})</span>
          </h2>
          <p className="telemetry-text text-xs text-pit-gray">{formatDate(tomorrow)}</p>
        </div>
        {tomorrowItems.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">Nothing on the schedule tomorrow.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tomorrowItems.map((e) =>
              e.kind === 'booking' ? (
                <BookingRowCard key={e.row.id} b={e.row} />
              ) : (
                <BlockRowCard key={e.block.id} block={e.block} />
              )
            )}
          </div>
        )}
      </section>

      {/* Upcoming */}
      <section>
        <h2 className="racing-headline text-xl text-grid-white mb-4">
          Upcoming <span className="text-pit-gray">({futureItems.length})</span>
        </h2>
        {futureItems.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">No upcoming bookings.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {futureItems.map((e) =>
              e.kind === 'booking' ? (
                <BookingRowCard key={e.row.id} b={e.row} />
              ) : (
                <BlockRowCard key={e.block.id} block={e.block} />
              )
            )}
          </div>
        )}
      </section>

      {/* Incomplete — started online, never finished the card step. Shown so the
          owner can follow up (call them) or ignore; not real reservations. */}
      {incompleteBookings.length > 0 && (
        <section>
          <h2 className="racing-headline text-xl text-grid-white mb-1">
            Incomplete <span className="text-pit-gray">({incompleteBookings.length})</span>
          </h2>
          <p className="telemetry-text text-xs text-pit-gray mb-4">
            Started an online booking but never saved a card — these aren&apos;t confirmed
            reservations. Follow up with the customer, or leave them.
          </p>
          <div className="space-y-2">
            {incompleteBookings.map((b) => (
              <BookingRowCard key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}
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
          {b.status === 'pending' && b.card_link_token && (
            <span className="telemetry-text text-xs px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
              Awaiting card
            </span>
          )}
          {b.status === 'pending' && !b.card_link_token && (
            <span className="telemetry-text text-xs px-2 py-0.5 bg-apex-red/10 text-apex-red border border-apex-red/30 uppercase tracking-wider">
              Incomplete — no card
            </span>
          )}
          {!cardOnFile && b.source === 'online' && b.status !== 'pending' && (
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

// A staff-set availability block, rendered flagged (red, dashed) so it's clearly
// NOT a bookable session — it's a personal appointment / closure that also holds
// the sims off the online calendar. Links to the availability page to remove it.
function BlockRowCard({ block }: { block: BlockItem }) {
  const wholeDay = !block.start_time || !block.end_time
  const timeLabel = wholeDay ? 'All day' : formatTime(block.start_time as string)
  const untilLabel = wholeDay ? null : formatTime(block.end_time as string)

  return (
    <Link
      href="/admin/availability"
      className="block bg-apex-red/5 border border-dashed border-apex-red/40 hover:border-apex-red/70 transition-colors p-4"
    >
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* Time */}
        <div className="col-span-12 sm:col-span-2">
          <p className="telemetry-text text-xs text-pit-gray">{formatDate(block.block_date)}</p>
          <p className="racing-headline text-lg text-apex-red">{timeLabel}</p>
          {untilLabel && (
            <p className="telemetry-text text-xs text-pit-gray">until {untilLabel}</p>
          )}
        </div>

        {/* Reason */}
        <div className="col-span-12 sm:col-span-7">
          <p className="telemetry-text text-grid-white">{block.reason || 'Unavailable'}</p>
          <p className="telemetry-text text-xs text-pit-gray">Sims held off the booking calendar</p>
        </div>

        {/* Flag */}
        <div className="col-span-12 sm:col-span-3 flex sm:justify-end">
          <span className="telemetry-text text-xs px-2 py-0.5 bg-apex-red/15 text-apex-red border border-apex-red/40 uppercase tracking-wider">
            🚫 Blocked — personal
          </span>
        </div>
      </div>
    </Link>
  )
}
