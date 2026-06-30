// Reporting period resolution for the admin Reports dashboard.
//
// All date math runs in America/New_York so the numbers line up with Mark's
// wall calendar. Every period resolves to an inclusive [from, to] pair of
// "YYYY-MM-DD" strings that we feed straight into the transactions query
// (occurred_on >= from AND occurred_on <= to) and the CSV export.
//
// Periods are URL-driven: ?period=this_month|last_month|30d|90d|year|custom
// with optional &from=&to= for the custom range.
import { getTodayEastern } from './accounting'

export type ReportPeriodId =
  | 'this_month'
  | 'last_month'
  | '30d'
  | '90d'
  | 'year'
  | 'custom'

export interface ResolvedPeriod {
  /** The canonical period id (after validation / fallback). */
  id: ReportPeriodId
  /** Inclusive start date, "YYYY-MM-DD" (Eastern). */
  from: string
  /** Inclusive end date, "YYYY-MM-DD" (Eastern). */
  to: string
  /** Human label, e.g. "This Month". */
  label: string
  /** Resolved range subtitle, e.g. "Jun 1 - Jun 30, 2026". */
  rangeLabel: string
}

export const PERIOD_OPTIONS: { id: ReportPeriodId; label: string }[] = [
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
]

export function isReportPeriodId(s: string): s is ReportPeriodId {
  return (
    s === 'this_month' ||
    s === 'last_month' ||
    s === '30d' ||
    s === '90d' ||
    s === 'year' ||
    s === 'custom'
  )
}

const PERIOD_LABELS: Record<ReportPeriodId, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  year: 'This Year',
  custom: 'Custom Range',
}

// Validate a "YYYY-MM-DD" string. Cheap structural + calendar check.
export function isValidDateString(s: string | undefined | null): s is string {
  if (!s) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  if (year < 2000 || year > 2200) return false
  return true
}

// Add `days` to a "YYYY-MM-DD" date, anchored at noon UTC to dodge TZ rolls.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

// First day of the month for a "YYYY-MM-DD".
function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return `${y}-${m}-01`
}

// Last day of the month for a "YYYY-MM-DD".
function lastOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

// "Jun 1 - Jun 30, 2026" / "Jan 1 - Dec 31, 2026". Same-year ranges drop the
// repeated year on the start side. Anchored noon UTC for stable formatting.
function formatRangeLabel(from: string, to: string): string {
  const fmt = (d: string, withYear: boolean) => {
    const [y, m, day] = d.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, day, 12))
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(dt)
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`
}

/**
 * Resolve a report period from URL params into an inclusive [from, to] range.
 *
 * Invalid / missing inputs fall back to "this_month". For the custom period,
 * both from and to must be valid dates (and from <= to, else they're swapped);
 * otherwise we fall back to this_month so the page never renders an error.
 */
export function resolveReportPeriod(
  periodParam: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined
): ResolvedPeriod {
  const today = getTodayEastern()
  const id: ReportPeriodId =
    periodParam && isReportPeriodId(periodParam) ? periodParam : 'this_month'

  if (id === 'custom') {
    if (isValidDateString(fromParam) && isValidDateString(toParam)) {
      // Swap if the user entered them backwards.
      const [from, to] =
        fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam]
      return {
        id: 'custom',
        from,
        to,
        label: PERIOD_LABELS.custom,
        rangeLabel: formatRangeLabel(from, to),
      }
    }
    // Bad custom range - fall back to this month rather than erroring.
    const from = firstOfMonth(today)
    const to = lastOfMonth(today)
    return {
      id: 'this_month',
      from,
      to,
      label: PERIOD_LABELS.this_month,
      rangeLabel: formatRangeLabel(from, to),
    }
  }

  let from: string
  let to: string
  switch (id) {
    case 'this_month':
      from = firstOfMonth(today)
      to = lastOfMonth(today)
      break
    case 'last_month': {
      const firstThis = firstOfMonth(today)
      const lastPrev = addDays(firstThis, -1)
      from = firstOfMonth(lastPrev)
      to = lastPrev
      break
    }
    case '30d':
      // Inclusive of today -> 30 calendar days = today minus 29.
      from = addDays(today, -29)
      to = today
      break
    case '90d':
      from = addDays(today, -89)
      to = today
      break
    case 'year':
      from = `${today.slice(0, 4)}-01-01`
      to = `${today.slice(0, 4)}-12-31`
      break
    default:
      from = firstOfMonth(today)
      to = lastOfMonth(today)
  }

  return {
    id,
    from,
    to,
    label: PERIOD_LABELS[id],
    rangeLabel: formatRangeLabel(from, to),
  }
}

// Trailing 12 months (including the current Eastern month) as {year, month}
// pairs, oldest first. Used by the "Revenue by Month" table.
export function trailingTwelveMonths(): { year: number; month: number }[] {
  const today = getTodayEastern()
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7))
  const out: { year: number; month: number }[] = []
  for (let i = 0; i < 12; i++) {
    out.unshift({ year, month })
    month -= 1
    if (month === 0) {
      month = 12
      year -= 1
    }
  }
  return out
}
