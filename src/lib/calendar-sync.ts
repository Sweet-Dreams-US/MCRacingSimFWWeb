// Keeps Mark's Google Calendar in step with the bookings table.
//
// Calendar events are created at booking time, best-effort: if Google rejects
// the insert, the error is logged and the booking carries on with no event.
// That is how every session crossing midnight went missing (the end time was
// put on the start date, so Google saw an event ending before it started), and
// nothing ever retried. This sweep runs every 15 minutes and, for every upcoming
// confirmed booking: creates a missing event, recreates one deleted by hand in
// Google Calendar, and corrects wrong times. Paid sessions are never invisible
// on the calendar for more than 15 minutes.
import type { createAdminClient } from './supabase/admin'
import { ensureBookingCalendarEvent, type BookingSource } from './calendar'
import { businessDateEastern } from './business-day'

type Admin = ReturnType<typeof createAdminClient>

/** How far ahead to keep the calendar correct. */
const LOOKAHEAD_DAYS = 120
/**
 * A booking created moments ago may still be getting its event from the
 * booking flow itself; give that a head start so we don't insert a duplicate.
 */
const FRESH_BOOKING_GRACE_MS = 3 * 60 * 1000

export interface CalendarSyncResult {
  checked: number
  created: string[]
  recreated: string[]
  retimed: string[]
  /** Booking ids whose existing calendar event was found by tag and linked. */
  adopted: string[]
  /** Duplicate events deleted (more than one event for the same booking). */
  duplicatesRemoved: number
  failed: Array<{ bookingId: string; error: string }>
  skipped: 'calendar_not_configured' | null
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function syncBookingCalendar(admin: Admin, now: Date = new Date()): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    checked: 0, created: [], recreated: [], retimed: [], adopted: [], duplicatesRemoved: 0, failed: [], skipped: null,
  }

  // From the current business evening (which includes tonight's after-midnight
  // tail) through the lookahead window.
  const from = businessDateEastern(now)
  const to = addDaysISO(from, LOOKAHEAD_DAYS)

  const { data, error } = await admin
    .from('bookings')
    .select(
      `id, session_date, start_time, duration_hours, racer_count, session_price_cents,
       no_show_fee_cents, source, google_calendar_event_id, created_at, updated_at,
       customer:customers(first_name, last_name, email, phone)`
    )
    .eq('status', 'confirmed')
    .gte('session_date', from)
    .lte('session_date', to)
    .order('session_date')
    .order('start_time')
    .limit(500)
  if (error) throw new Error(`Calendar sync could not read bookings: ${error.message}`)

  for (const b of data ?? []) {
    if (!b.google_calendar_event_id && now.getTime() - new Date(b.updated_at).getTime() < FRESH_BOOKING_GRACE_MS) {
      continue
    }
    result.checked++
    const c = Array.isArray(b.customer) ? b.customer[0] : b.customer
    const name = c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : ''

    try {
      const outcome = await ensureBookingCalendarEvent(b.google_calendar_event_id, {
        bookingId: b.id,
        customerName: name || 'Walk-in',
        customerEmail: c?.email ?? '',
        customerPhone: c?.phone ?? null,
        sessionDate: b.session_date,
        startTime: b.start_time,
        durationHours: Number(b.duration_hours),
        racerCount: b.racer_count,
        sessionPriceCents: b.session_price_cents,
        noShowFeeCents: b.no_show_fee_cents,
        source: b.source as BookingSource,
      })
      if (outcome.action === 'skipped') {
        result.skipped = outcome.reason
        break // no credentials: nothing below can work either
      }
      result.duplicatesRemoved += outcome.duplicatesRemoved
      if (outcome.action === 'created' || outcome.action === 'adopted') {
        // Link the booking to its event. Safe to write unconditionally: the
        // calendar itself is the source of truth for "does this booking have
        // an event" (tag lookup), so a lost write just gets re-linked next run
        // instead of producing a duplicate.
        const { error: saveErr } = await admin
          .from('bookings')
          .update({ google_calendar_event_id: outcome.eventId })
          .eq('id', b.id)
        if (saveErr) throw new Error(`event ${outcome.eventId} not linked: ${saveErr.message}`)
        if (outcome.action === 'adopted') result.adopted.push(b.id)
        else (outcome.reason === 'missing' ? result.created : result.recreated).push(b.id)
      } else if (outcome.action === 'retimed') {
        result.retimed.push(b.id)
      }
    } catch (err) {
      result.failed.push({ bookingId: b.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}
