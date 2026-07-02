// Dashboard metrics — the money + operational aggregates for /admin.
//
// Correctness rules (see the accounting model):
//   - Revenue comes ONLY from the `transactions` table (never stripe_charges,
//     which would double-count card sales and miss cash).
//   - amount_cents is SIGNED; gross revenue sums GROSS_INCOME_TYPES only.
//   - tip_cents is ALREADY inside amount_cents — never add it on top.
//   - Always filter soft_deleted_at IS NULL.
//   - Bucket money by occurred_on (a plain Eastern DATE), never created_at
//     (UTC) — the venue is open past midnight, so UTC bucketing misassigns
//     late-night sales.
import type { createAdminClient } from './supabase/admin'
import { GROSS_INCOME_TYPES, getTodayEastern } from './accounting'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// Booking statuses that represent a REAL session (pending = abandoned/no card,
// cancelled = called off). Used for "on the schedule" counts.
const REAL_BOOKING_STATUSES = ['confirmed', 'completed', 'partial_noshow', 'noshow'] as const
// Statuses that mean the session was actually closed out (ran or was a no-show).
const CLOSED_BOOKING_STATUSES = ['completed', 'partial_noshow', 'noshow'] as const
// Statuses that mean the session actually ran (some/all racers showed).
const RAN_BOOKING_STATUSES = ['completed', 'partial_noshow'] as const

export interface DailyPoint {
  date: string // "YYYY-MM-DD" (Eastern)
  cents: number
}

export interface DashboardMetrics {
  revenue: {
    todayCents: number
    weekCents: number // Mon–Sun of the current Eastern week
    monthCents: number // current Eastern calendar month
    daily: DailyPoint[] // last 14 days, oldest → newest, zero-filled
  }
  ops: {
    todaysBookings: number
    upcomingSessions: number
    newCustomers30d: number
    completedSessions30d: number
    noShowRatePct: number | null // null when there's no closed-out session yet
  }
  upcoming: UpcomingBooking[]
}

export interface UpcomingBooking {
  id: string
  sessionDate: string
  startTime: string
  racerCount: number
  status: string
  customerName: string | null
}

// ---- Eastern date string math (noon-anchored to dodge UTC rolls) ----------

/** "YYYY-MM-DD" n days before the given Eastern date. Pure string math. */
export function addDaysEastern(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() + delta)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Monday of the Eastern week containing `ymd` (venue week is Mon–Sun). */
export function startOfWeekEastern(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() // 0=Sun … 6=Sat
  const daysFromMonday = (dow + 6) % 7
  return addDaysEastern(ymd, -daysFromMonday)
}

/** Sum gross-revenue cents over an inclusive occurred_on range. */
async function sumRevenue(
  supabase: SupabaseAdmin,
  from: string,
  to: string
): Promise<number> {
  const { data } = await supabase
    .from('transactions')
    .select('amount_cents')
    .in('type', [...GROSS_INCOME_TYPES])
    .is('soft_deleted_at', null)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
  return (data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0)
}

export async function getDashboardMetrics(
  supabase: SupabaseAdmin
): Promise<DashboardMetrics> {
  const today = getTodayEastern()
  const weekStart = startOfWeekEastern(today)
  const monthStart = `${today.slice(0, 7)}-01`
  const fourteenAgo = addDaysEastern(today, -13) // 14 points inclusive of today
  const thirtyAgo = addDaysEastern(today, -29)

  // Run everything in parallel — all independent reads.
  const [
    todayCents,
    weekCents,
    monthCents,
    dailyRows,
    todaysBookings,
    upcomingSessions,
    newCustomers30d,
    completedSessions30d,
    closedRows,
    upcomingRows,
  ] = await Promise.all([
    sumRevenue(supabase, today, today),
    sumRevenue(supabase, weekStart, today),
    sumRevenue(supabase, monthStart, today),
    // Daily series rows for the last 14 days (bucketed in JS below).
    supabase
      .from('transactions')
      .select('amount_cents, occurred_on')
      .in('type', [...GROSS_INCOME_TYPES])
      .is('soft_deleted_at', null)
      .gte('occurred_on', fourteenAgo)
      .lte('occurred_on', today),
    // Today's sessions on the schedule (real statuses only).
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('session_date', today)
      .in('status', [...REAL_BOOKING_STATUSES]),
    // Upcoming confirmed sessions after today.
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmed')
      .gt('session_date', today),
    // New customers in the last 30 days. created_at is timestamptz; comparing
    // against the Eastern date string is within a few hours at the boundary —
    // immaterial for a rolling-30-day count.
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', thirtyAgo),
    // Sessions actually run in the last 30 days.
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .in('status', [...RAN_BOOKING_STATUSES])
      .gte('session_date', thirtyAgo)
      .lte('session_date', today),
    // Closed-out bookings in the last 30 days → no-show rate.
    supabase
      .from('bookings')
      .select('status')
      .in('status', [...CLOSED_BOOKING_STATUSES])
      .gte('session_date', thirtyAgo)
      .lte('session_date', today),
    // Next few confirmed bookings for the upcoming list.
    supabase
      .from('bookings')
      .select('id, session_date, start_time, racer_count, status, customer:customers(first_name, last_name)')
      .eq('status', 'confirmed')
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(6),
  ])

  // Zero-filled 14-day series.
  const daily: DailyPoint[] = []
  for (let i = 13; i >= 0; i--) daily.push({ date: addDaysEastern(today, -i), cents: 0 })
  const byDate = new Map(daily.map((p) => [p.date, p]))
  for (const row of dailyRows.data ?? []) {
    const p = byDate.get(row.occurred_on as string)
    if (p) p.cents += row.amount_cents ?? 0
  }

  // No-show rate: (partial_noshow + noshow) / closed-out total.
  const closed = closedRows.data ?? []
  const noShowCount = closed.filter(
    (r) => r.status === 'noshow' || r.status === 'partial_noshow'
  ).length
  const noShowRatePct = closed.length > 0 ? Math.round((noShowCount / closed.length) * 100) : null

  const upcoming: UpcomingBooking[] = (upcomingRows.data ?? []).map((b) => {
    const c = Array.isArray(b.customer) ? b.customer[0] : b.customer
    return {
      id: b.id,
      sessionDate: b.session_date,
      startTime: b.start_time,
      racerCount: b.racer_count,
      status: b.status,
      customerName: c ? `${c.first_name} ${c.last_name}`.trim() : null,
    }
  })

  return {
    revenue: { todayCents, weekCents, monthCents, daily },
    ops: {
      todaysBookings: todaysBookings.count ?? 0,
      upcomingSessions: upcomingSessions.count ?? 0,
      newCustomers30d: newCustomers30d.count ?? 0,
      completedSessions30d: completedSessions30d.count ?? 0,
      noShowRatePct,
    },
    upcoming,
  }
}
