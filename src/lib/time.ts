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
