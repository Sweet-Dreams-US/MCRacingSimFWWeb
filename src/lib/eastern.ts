// Fort Wayne calendar helpers.
//
// The books, the booking calendar and the marketing payout are all kept on
// LOCAL (America/New_York) dates, so "this month" has to flip at Eastern
// midnight, not UTC midnight. Pure functions only — no env, no database —
// so they're safe to import from anywhere and trivial to test.

/** Inclusive YYYY-MM-DD range for a calendar month. */
export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  // Day 0 of the NEXT month is the last day of this one (month is 1-indexed).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` }
}

/** The calendar month it currently is in Fort Wayne. */
export function easternYearMonth(now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now)
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
  }
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/**
 * The exact instant Eastern midnight falls on for the 1st of a month, as a UTC
 * Date. Eastern is UTC-5 (EST) or UTC-4 (EDT), so midnight is either 05:00Z or
 * 04:00Z — try the daylight-time candidate and fall back if it isn't midnight.
 */
export function easternMonthStartUtc(year: number, month: number): Date {
  const candidate = new Date(Date.UTC(year, month - 1, 1, 4))
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(candidate)
  return Number(hour) === 0 ? candidate : new Date(Date.UTC(year, month - 1, 1, 5))
}
