// Shared helpers for the admin accounting pages (transactions, expenses,
// payouts, reports). Date math is always America/New_York so monthly P&L
// numbers match what Mark sees on his wall calendar.
import type { Database } from './supabase/types'

export type TransactionType = Database['public']['Enums']['transaction_type']
export type PaymentMethod = Database['public']['Enums']['payment_method_type']

// Outflow types — amounts on these rows are stored NEGATIVE so SUM = net P&L.
// Anything not in this set is treated as inflow (positive amount).
export const OUTFLOW_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'expense',
  'owner_payout',
  'employee_payout',
  'marketing_payout',
  'cash_withdrawal',
  'refund',
])

export const INCOME_TYPES: ReadonlySet<TransactionType> = new Set<TransactionType>([
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
  'cash_deposit',
])

// GROSS revenue = real sales only. Deliberately EXCLUDES cash_deposit /
// cash_withdrawal (cash-drawer moves, not P&L) and refunds. This is the same
// definition the Reports page's "Gross Revenue" headline uses — keep them in
// sync so dashboard and reports numbers reconcile.
export const GROSS_INCOME_TYPES: readonly TransactionType[] = [
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
]

export function isOutflow(type: TransactionType): boolean {
  return OUTFLOW_TYPES.has(type)
}

// Human label for a transaction_type enum value.
export function formatTransactionType(t: TransactionType): string {
  const map: Record<TransactionType, string> = {
    booking_income: 'Booking Income',
    no_show_fee: 'No-Show Fee',
    in_person_sale: 'In-Person Sale',
    other_income: 'Other Income',
    expense: 'Expense',
    owner_payout: 'Owner Payout',
    employee_payout: 'Employee Payout',
    marketing_payout: 'Marketing Payout',
    cash_deposit: 'Cash Deposit',
    cash_withdrawal: 'Cash Withdrawal',
    refund: 'Refund',
    adjustment: 'Adjustment',
  }
  return map[t]
}

// "$1,234.56" — handles negative correctly: "-$1,234.56".
export function formatDollars(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${(abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// "YYYY-MM-DD" of today in Eastern time. All occurred_on defaults should use
// this so a 1am transaction doesn't slip into the previous fiscal day.
export function getTodayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

// "Mar 15, 2026" from "YYYY-MM-DD" — anchored at noon UTC to dodge TZ rolls.
export function formatDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  const dt = new Date(Date.UTC(y, m - 1, day, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt)
}

// "2:30 PM" from "14:30:00".
export function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr ?? '00'} ${period}`
}

// Convert a "12.34" / "12" / "1,234.50" dollar string to integer cents.
// Returns NaN on invalid input — callers should validate before insert.
export function dollarsToCents(input: string): number {
  const cleaned = input.replace(/[$,\s]/g, '').trim()
  if (cleaned === '') return NaN
  const f = parseFloat(cleaned)
  if (!isFinite(f)) return NaN
  // Round to nearest cent to avoid floating-point drift (e.g. 12.345 → 1235).
  return Math.round(f * 100)
}

export function isValidTransactionType(s: string): s is TransactionType {
  return (
    s === 'booking_income' ||
    s === 'no_show_fee' ||
    s === 'in_person_sale' ||
    s === 'other_income' ||
    s === 'expense' ||
    s === 'owner_payout' ||
    s === 'employee_payout' ||
    s === 'marketing_payout' ||
    s === 'cash_deposit' ||
    s === 'cash_withdrawal' ||
    s === 'refund' ||
    s === 'adjustment'
  )
}

export function isValidPaymentMethod(s: string): s is PaymentMethod {
  return (
    s === 'stripe_online' ||
    s === 'stripe_terminal' ||
    s === 'cash' ||
    s === 'other' ||
    s === 'internal'
  )
}

// Inclusive [start, end] date pair for a calendar month in Eastern time.
// Used by reports + CSV export queries against transactions.occurred_on.
export function monthBounds(year: number, month: number): {
  start: string
  end: string
} {
  const mm = String(month).padStart(2, '0')
  // First day, then last day via a 0th-of-next-month trick.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

// "January 2026" from (year, 1-indexed month).
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function formatMonthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? `Month ${month}`} ${year}`
}

// Eastern-time current { year, month } — used as defaults on the reports page.
export function getEasternYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date())
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year, month }
}
