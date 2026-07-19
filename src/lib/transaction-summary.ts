// Weekly / monthly rollups for the /admin/transactions ledger.
//
// The ledger is a flat, newest-first list of every transaction. To make it
// readable (instead of "a list of a ton of numbers") we group the rows into
// calendar months, and within each month into Monday–Sunday weeks, tallying
// money-in / money-out / net for each bucket.
//
// Money convention (shared with the whole accounting stack): amount_cents is
// SIGNED — positive = money in, negative = money out — so:
//   in   = Σ positive amounts
//   out  = Σ |negative amounts|   (reported as a positive magnitude)
//   net  = Σ amounts              (= in − out)
//
// Weeks that straddle a month boundary are CLIPPED to the month: the days that
// fall in the month are counted under that month and labelled with the clipped
// range (e.g. a Jun 30 – Jul 6 week shows as "Jul 1 – Jul 6" under July). That
// guarantees each month total equals the sum of its week rows — no drift, no
// double counting.
//
// All date math is calendar-only (the strings are already "YYYY-MM-DD" fiscal
// dates in Eastern time); we anchor at UTC noon so no timezone can roll a date
// to the day before.
import { formatMonthYear, monthBounds } from './accounting'

export interface TxAmountRow {
  occurred_on: string // "YYYY-MM-DD"
  amount_cents: number
}

export interface WeekTotals {
  /** Monday of the week (ISO "YYYY-MM-DD"); the grouping key within a month. */
  mondayISO: string
  /** Clipped-to-month human range, e.g. "Jul 13 – Jul 19". */
  rangeLabel: string
  inCents: number
  outCents: number // positive magnitude
  netCents: number
  count: number
}

export interface MonthTotals {
  year: number
  month: number // 1-indexed
  label: string // "July 2026"
  inCents: number
  outCents: number // positive magnitude
  netCents: number
  count: number
  weeks: WeekTotals[] // newest-first
}

export interface TransactionSummary {
  months: MonthTotals[] // newest-first
  /**
   * Flat lookup for the inline ledger dividers, keyed by `${year}-${mm}|${mondayISO}`
   * — the same (month, week) bucket the summary uses, so a divider shows the
   * authoritative clipped-week total even when pagination only shows part of it.
   */
  weekIndex: Map<string, WeekTotals>
}

// ---- Pure date helpers (UTC-anchored, calendar-only) -----------------------

function toUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)) // noon anchor dodges TZ rolls
}

function isoOf(dt: Date): string {
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shift an ISO date by whole days (calendar arithmetic). */
export function shiftISO(dateStr: string, days: number): string {
  const dt = toUTC(dateStr)
  dt.setUTCDate(dt.getUTCDate() + days)
  return isoOf(dt)
}

/** Monday (ISO) of the week containing dateStr. Weeks run Monday–Sunday. */
export function mondayOfISO(dateStr: string): string {
  const dt = toUTC(dateStr)
  const dow = dt.getUTCDay() // 0=Sun … 6=Sat
  const backToMonday = (dow + 6) % 7 // Mon→0, Tue→1 … Sun→6
  return shiftISO(dateStr, -backToMonday)
}

/** "Jul 13" from "YYYY-MM-DD" (Eastern-safe, no year). */
export function formatMonthDay(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(toUTC(dateStr))
}

/** The `${year}-${mm}|${mondayISO}` bucket key for a transaction date. */
export function bucketKey(occurredOn: string): string {
  const monthKey = occurredOn.slice(0, 7) // "YYYY-MM"
  return `${monthKey}|${mondayOfISO(occurredOn)}`
}

// ---- Aggregation -----------------------------------------------------------

interface WeekAccum {
  mondayISO: string
  inCents: number
  outCents: number
  netCents: number
  count: number
}

interface MonthAccum {
  year: number
  month: number
  inCents: number
  outCents: number
  netCents: number
  count: number
  weeks: Map<string, WeekAccum> // keyed by mondayISO
}

/**
 * Roll a flat list of transactions into newest-first months, each with its
 * newest-first (clipped) weeks, plus a flat week index for inline dividers.
 * A whole-day nuance: rows are filed under THEIR OWN month, so a straddling
 * week is split across the two months it touches.
 */
export function summarizeTransactions(rows: TxAmountRow[]): TransactionSummary {
  const months = new Map<string, MonthAccum>()

  for (const row of rows) {
    const occurred = row.occurred_on
    if (!occurred || occurred.length < 7) continue
    const monthKey = occurred.slice(0, 7)
    const [y, m] = monthKey.split('-').map(Number)
    const monday = mondayOfISO(occurred)
    const amt = row.amount_cents

    let month = months.get(monthKey)
    if (!month) {
      month = { year: y, month: m, inCents: 0, outCents: 0, netCents: 0, count: 0, weeks: new Map() }
      months.set(monthKey, month)
    }
    let week = month.weeks.get(monday)
    if (!week) {
      week = { mondayISO: monday, inCents: 0, outCents: 0, netCents: 0, count: 0 }
      month.weeks.set(monday, week)
    }

    if (amt >= 0) {
      month.inCents += amt
      week.inCents += amt
    } else {
      month.outCents += -amt
      week.outCents += -amt
    }
    month.netCents += amt
    week.netCents += amt
    month.count += 1
    week.count += 1
  }

  const weekIndex = new Map<string, WeekTotals>()

  const monthList: MonthTotals[] = Array.from(months.values())
    .sort((a, b) =>
      a.year !== b.year ? b.year - a.year : b.month - a.month
    )
    .map((month) => {
      const bounds = monthBounds(month.year, month.month)
      const weeks: WeekTotals[] = Array.from(month.weeks.values())
        .sort((a, b) => (a.mondayISO < b.mondayISO ? 1 : -1)) // newest-first
        .map((w) => {
          const sunday = shiftISO(w.mondayISO, 6)
          // Clip the displayed range to the month this bucket belongs to.
          const dispStart = w.mondayISO < bounds.start ? bounds.start : w.mondayISO
          const dispEnd = sunday > bounds.end ? bounds.end : sunday
          const rangeLabel =
            dispStart === dispEnd
              ? formatMonthDay(dispStart)
              : `${formatMonthDay(dispStart)} – ${formatMonthDay(dispEnd)}`
          const totals: WeekTotals = {
            mondayISO: w.mondayISO,
            rangeLabel,
            inCents: w.inCents,
            outCents: w.outCents,
            netCents: w.netCents,
            count: w.count,
          }
          const mm = String(month.month).padStart(2, '0')
          weekIndex.set(`${month.year}-${mm}|${w.mondayISO}`, totals)
          return totals
        })
      return {
        year: month.year,
        month: month.month,
        label: formatMonthYear(month.year, month.month),
        inCents: month.inCents,
        outCents: month.outCents,
        netCents: month.netCents,
        count: month.count,
        weeks,
      }
    })

  return { months: monthList, weekIndex }
}
