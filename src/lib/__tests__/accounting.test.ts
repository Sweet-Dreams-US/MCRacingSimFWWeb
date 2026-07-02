import { describe, it, expect } from 'vitest'
import {
  formatDollars,
  dollarsToCents,
  isOutflow,
  monthBounds,
  getTodayEastern,
  GROSS_INCOME_TYPES,
} from '../accounting'

describe('formatDollars (signed)', () => {
  it('formats positive with thousands separators', () => {
    expect(formatDollars(123456)).toBe('$1,234.56')
  })
  it('formats negative with a leading minus', () => {
    expect(formatDollars(-123456)).toBe('-$1,234.56')
  })
  it('zero', () => {
    expect(formatDollars(0)).toBe('$0.00')
  })
})

describe('dollarsToCents', () => {
  it('parses plain + comma + short forms', () => {
    expect(dollarsToCents('12.34')).toBe(1234)
    expect(dollarsToCents('1,234.50')).toBe(123450)
    expect(dollarsToCents('12')).toBe(1200)
    expect(dollarsToCents('$45')).toBe(4500)
  })
  it('rounds to the nearest cent', () => {
    expect(dollarsToCents('12.345')).toBe(1235)
  })
  it('returns NaN for junk / empty', () => {
    expect(Number.isNaN(dollarsToCents(''))).toBe(true)
    expect(Number.isNaN(dollarsToCents('abc'))).toBe(true)
  })
})

describe('GROSS_INCOME_TYPES', () => {
  it('includes real sales + party deposits', () => {
    for (const t of ['booking_income', 'no_show_fee', 'in_person_sale', 'other_income', 'party_deposit']) {
      expect(GROSS_INCOME_TYPES).toContain(t)
    }
  })
  it('excludes cash movements + refunds/expenses', () => {
    for (const t of ['cash_deposit', 'cash_withdrawal', 'refund', 'expense']) {
      expect(GROSS_INCOME_TYPES).not.toContain(t)
    }
  })
})

describe('isOutflow', () => {
  it('outflows are negative-signed types', () => {
    for (const t of ['expense', 'owner_payout', 'refund', 'cash_withdrawal'] as const) {
      expect(isOutflow(t)).toBe(true)
    }
  })
  it('income types are not outflows', () => {
    for (const t of ['booking_income', 'party_deposit', 'no_show_fee'] as const) {
      expect(isOutflow(t)).toBe(false)
    }
  })
})

describe('monthBounds', () => {
  it('inclusive first/last day', () => {
    expect(monthBounds(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthBounds(2026, 12)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
  it('handles a leap February', () => {
    expect(monthBounds(2024, 2).end).toBe('2024-02-29')
  })
})

describe('getTodayEastern', () => {
  it('is a YYYY-MM-DD string', () => {
    expect(getTodayEastern()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
