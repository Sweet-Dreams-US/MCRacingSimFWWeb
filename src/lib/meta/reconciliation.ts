// src/lib/meta/reconciliation.ts
// "Did Meta actually hear about every booking?" — answered from our own
// database, without trusting Ads Manager.
//
// This exists because of a real miss: July reported 8 Schedule conversions in
// Events Manager against 13 genuine bookings, and nothing in the system could
// show that until someone compared the two by hand a month later. Every
// confirmed online booking now stamps `meta_schedule_sent_at` when its
// server-side Schedule event is accepted, so a gap is visible the same week.
//
// Read it on /admin/ads next to the Meta-reported numbers:
//   • bookings vs scheduleSent  → did OUR side fire the conversion?
//   • scheduleSent vs Meta's "Bookings (Schedule)" → did META count it?
//   • withClickId               → how many can be attributed to an ad at all
//
// Never throws: returns a discriminated result so a missing migration or a
// Supabase blip renders a friendly note instead of breaking the admin page.
import { createAdminClient } from '../supabase/admin'

/**
 * The day migration 016 added `meta_schedule_sent_at` to production.
 *
 * Bookings created before this CANNOT have a delivery stamp — the column did
 * not exist — so counting them would report every historical week as 100%
 * missing and make a healthy dashboard look like a total outage. That is the
 * opposite of the point: this table exists to make a REAL gap obvious, and it
 * can only do that if it is quiet when nothing is wrong.
 *
 * Backfilling the old rows was the alternative and would have been a lie: we
 * genuinely do not know which historical bookings reached Meta, and the whole
 * reason this feature exists is that several did not.
 */
export const SCHEDULE_TRACKING_LIVE_FROM = '2026-08-20T00:00:00.000Z'

export interface ReconciliationWeek {
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string
  /** Online bookings that got past the card step. */
  bookings: number
  /** …of those, how many had a Schedule event accepted by Meta. */
  scheduleSent: number
  /** …and how many did not. Should be 0. */
  missing: number
  /** …how many carried a Meta click id (attributable to a specific ad). */
  withClickId: number
}

export type ReconciliationResult =
  | { status: 'unavailable'; message: string }
  | { status: 'ok'; weeks: ReconciliationWeek[] }

/** Monday-start week key for a timestamp, in YYYY-MM-DD. */
function weekStartOf(iso: string): string {
  const d = new Date(iso)
  // getUTCDay(): 0=Sun … 6=Sat. Shift so Monday is the start of the week.
  const dayFromMonday = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayFromMonday)
  return d.toISOString().slice(0, 10)
}

/**
 * Weekly booking-vs-Schedule counts, newest week first.
 *
 * Bucketed in JS rather than SQL so this keeps working on a plain PostgREST
 * select — no view or RPC required beyond the columns migration 016 adds.
 */
export async function getScheduleReconciliation(weeks = 6): Promise<ReconciliationResult> {
  try {
    const windowStart = new Date()
    windowStart.setUTCDate(windowStart.getUTCDate() - weeks * 7)
    // Never look back past the day the delivery stamp started existing.
    const liveFrom = new Date(SCHEDULE_TRACKING_LIVE_FROM)
    const since = windowStart > liveFrom ? windowStart : liveFrom

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('bookings')
      .select('created_at, meta_schedule_sent_at, fbc, fbclid')
      .eq('source', 'online')
      .neq('status', 'pending') // everything past the card step
      .gte('created_at', since.toISOString())

    if (error) {
      // Overwhelmingly the "migration 016 not applied yet" case.
      return {
        status: 'unavailable',
        message: `Reconciliation needs migration 016 (meta_schedule_sent_at). ${error.message}`,
      }
    }

    const byWeek = new Map<string, ReconciliationWeek>()
    for (const row of data ?? []) {
      const key = weekStartOf(row.created_at)
      const wk =
        byWeek.get(key) ??
        { weekStart: key, bookings: 0, scheduleSent: 0, missing: 0, withClickId: 0 }
      wk.bookings++
      if (row.meta_schedule_sent_at) wk.scheduleSent++
      else wk.missing++
      if (row.fbc || row.fbclid) wk.withClickId++
      byWeek.set(key, wk)
    }

    return {
      status: 'ok',
      weeks: Array.from(byWeek.values()).sort((a, b) =>
        b.weekStart.localeCompare(a.weekStart)
      ),
    }
  } catch (err) {
    return {
      status: 'unavailable',
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
