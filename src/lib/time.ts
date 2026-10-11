// Wall-clock time math shared by the booking pipeline and the calendar sync.
//
// This lives in its own module because it used to exist TWICE — once in
// booking.ts and once as a private `addHours` in calendar.ts, with a comment
// promising they stayed identical. Both were written for whole-hour sessions
// and did `(h + hours) % 24`, so when half-hour lengths shipped they produced
// "14.5:00" and Postgres rejected the insert ("invalid input syntax for type
// time"). One implementation, minute-based, so a fractional duration can never
// reach a TIME column again.

/** Minutes in a day — the wrap-around modulus for a 24h clock. */
const MINUTES_PER_DAY = 24 * 60

/**
 * Add `durationHours` to a "HH:MM" (or "HH:MM:SS") 24-hour string, wrapping
 * past midnight (23:00 + 3h = "02:00"). Fractional hours are supported —
 * 13:00 + 1.5h = "14:30".
 *
 * Always returns a valid zero-padded "HH:MM", which is what the DB's TIME
 * columns and the Google Calendar payload both expect.
 */
export function addHoursToTime(startTime: string, durationHours: number): string {
  const [h = 0, m = 0] = startTime.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(durationHours)) {
    throw new Error(
      `addHoursToTime: bad input (startTime=${JSON.stringify(startTime)}, durationHours=${durationHours})`
    )
  }
  // Round to whole minutes so a float duration can't yield a fractional minute.
  const totalMinutes = h * 60 + m + Math.round(durationHours * 60)
  // Double-modulo keeps a negative duration in range rather than emitting "-1:00".
  const wrapped = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const endHour = Math.floor(wrapped / 60)
  const endMinute = wrapped % 60
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`
}

/** "YYYY-MM-DD" plus `days`, on the calendar (no timezone involved). */
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Hour the venue opens. A start earlier than this is the late-night tail of the previous evening. */
const VENUE_OPEN_HOUR = 12

export interface WallClockWindow {
  startDate: string // "YYYY-MM-DD" the session actually starts on
  startTime: string // "HH:MM"
  endDate: string // "YYYY-MM-DD" the session actually ends on
  endTime: string // "HH:MM"
}

/**
 * The real calendar dates and times of a booking.
 *
 * A booking's session_date is the EVENING it belongs to, but the venue runs
 * past midnight, so:
 *   - 11:30pm for 2h on Oct 10 ends at 1:30am on Oct 11 (not 1:30am Oct 10,
 *     which is before it starts — Google rejected those events outright, so
 *     every session crossing midnight was missing from Mark's calendar), and
 *   - a 1:00am start on session_date Oct 9 is really 1:00am on Oct 10.
 * Same convention as toExtendedMinutes in availability.ts.
 */
export function bookingWallClockWindow(
  sessionDate: string,
  startTime: string,
  durationHours: number
): WallClockWindow {
  const [h = 0, m = 0] = startTime.split(':').map(Number)
  const startDate = h < VENUE_OPEN_HOUR ? addDaysISO(sessionDate, 1) : sessionDate
  const startTotal = h * 60 + m
  const endTotal = startTotal + Math.round(durationHours * 60)
  return {
    startDate,
    startTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    endDate: addDaysISO(startDate, Math.floor(endTotal / MINUTES_PER_DAY)),
    endTime: addHoursToTime(startTime, durationHours),
  }
}
