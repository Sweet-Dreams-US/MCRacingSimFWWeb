// "Business day" logic. The venue runs late (noon–2am), so a session at 1am
// belongs to the PREVIOUS calendar day's business day. We treat anything before
// 7am Eastern as still part of yesterday — so at 1am "today's bookings" are last
// night's late sessions, and the reader/admin/stats don't roll over until the
// morning.
//
// Booking rows already store late-night sessions on the evening's date (see
// src/lib/availability.ts), so grouping is just by session_date vs the current
// business date.

export const BUSINESS_DAY_START_HOUR = 7 // before 7am Eastern → previous business day

/** The current business date (YYYY-MM-DD, Eastern), rolling over at 7am. */
export function businessDateEastern(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))
  let h = Number(get('hour'))
  if (h === 24) h = 0 // some engines format midnight as "24"

  if (h < BUSINESS_DAY_START_HOUR) {
    return addDaysISO(`${y}-${pad(m)}-${pad(d)}`, -1)
  }
  return `${y}-${pad(m)}-${pad(d)}`
}

/** Add (or subtract) whole days to a YYYY-MM-DD string. */
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
