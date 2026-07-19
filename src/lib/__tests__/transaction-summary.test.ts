import { describe, it, expect } from 'vitest'
import {
  mondayOfISO,
  shiftISO,
  bucketKey,
  formatMonthDay,
  summarizeTransactions,
  type TxAmountRow,
} from '../transaction-summary'

describe('mondayOfISO', () => {
  it('returns the same day for a Monday', () => {
    // 2026-07-13 is a Monday.
    expect(mondayOfISO('2026-07-13')).toBe('2026-07-13')
  })
  it('rolls back mid-week to Monday', () => {
    expect(mondayOfISO('2026-07-16')).toBe('2026-07-13') // Thu → Mon
    expect(mondayOfISO('2026-07-19')).toBe('2026-07-13') // Sun → Mon
  })
  it('crosses a month/year boundary correctly', () => {
    // 2026-01-01 is a Thursday → Monday is 2025-12-29.
    expect(mondayOfISO('2026-01-01')).toBe('2025-12-29')
  })
})

describe('shiftISO', () => {
  it('adds and subtracts whole days across month ends', () => {
    expect(shiftISO('2026-07-13', 6)).toBe('2026-07-19')
    expect(shiftISO('2026-06-30', 1)).toBe('2026-07-01')
    expect(shiftISO('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('formatMonthDay', () => {
  it('formats without a year and without a timezone roll', () => {
    expect(formatMonthDay('2026-07-13')).toBe('Jul 13')
    expect(formatMonthDay('2026-01-01')).toBe('Jan 1')
  })
})

describe('summarizeTransactions', () => {
  it('splits money-in / money-out / net by sign', () => {
    const rows: TxAmountRow[] = [
      { occurred_on: '2026-07-14', amount_cents: 5000 }, // in
      { occurred_on: '2026-07-15', amount_cents: -2000 }, // out
      { occurred_on: '2026-07-16', amount_cents: 3000 }, // in
    ]
    const { months } = summarizeTransactions(rows)
    expect(months).toHaveLength(1)
    const m = months[0]
    expect(m.inCents).toBe(8000)
    expect(m.outCents).toBe(2000)
    expect(m.netCents).toBe(6000)
    expect(m.count).toBe(3)
    // All three fall in the same Mon–Sun week (Jul 13–19).
    expect(m.weeks).toHaveLength(1)
    expect(m.weeks[0].rangeLabel).toBe('Jul 13 – Jul 19')
    expect(m.weeks[0].netCents).toBe(6000)
  })

  it('orders months and weeks newest-first', () => {
    const rows: TxAmountRow[] = [
      { occurred_on: '2026-06-02', amount_cents: 100 },
      { occurred_on: '2026-07-06', amount_cents: 100 }, // week of Jul 6
      { occurred_on: '2026-07-20', amount_cents: 100 }, // week of Jul 20
    ]
    const { months } = summarizeTransactions(rows)
    expect(months.map((m) => `${m.year}-${m.month}`)).toEqual(['2026-7', '2026-6'])
    const july = months[0]
    // Newest week first.
    expect(july.weeks[0].mondayISO).toBe('2026-07-20')
    expect(july.weeks[1].mondayISO).toBe('2026-07-06')
  })

  it('clips a month-straddling week so month total = sum of its weeks', () => {
    // The week Mon 2026-06-29 … Sun 2026-07-05 straddles June/July.
    const rows: TxAmountRow[] = [
      { occurred_on: '2026-06-30', amount_cents: 1000 }, // June side
      { occurred_on: '2026-07-01', amount_cents: 4000 }, // July side
      { occurred_on: '2026-07-02', amount_cents: 500 }, // July side
    ]
    const { months, weekIndex } = summarizeTransactions(rows)
    const june = months.find((m) => m.month === 6)!
    const july = months.find((m) => m.month === 7)!

    // Same Monday, but split into two per-month buckets.
    expect(june.weeks[0].mondayISO).toBe('2026-06-29')
    expect(july.weeks[0].mondayISO).toBe('2026-06-29')

    // Ranges clipped to their month.
    expect(june.weeks[0].rangeLabel).toBe('Jun 29 – Jun 30')
    expect(july.weeks[0].rangeLabel).toBe('Jul 1 – Jul 5')

    // Each month total equals the sum of its (clipped) week rows — no drift.
    expect(june.netCents).toBe(1000)
    expect(june.weeks.reduce((s, w) => s + w.netCents, 0)).toBe(june.netCents)
    expect(july.netCents).toBe(4500)
    expect(july.weeks.reduce((s, w) => s + w.netCents, 0)).toBe(july.netCents)

    // weekIndex is keyed by `${year}-${mm}|${mondayISO}` for the ledger dividers.
    expect(weekIndex.get('2026-07|2026-06-29')?.netCents).toBe(4500)
    expect(weekIndex.get('2026-06|2026-06-29')?.netCents).toBe(1000)
    expect(bucketKey('2026-07-02')).toBe('2026-07|2026-06-29')
  })

  it('labels a single-day clipped week without a range', () => {
    // Mon 2026-06-29 week; only the Tuesday Jun 30 falls in June.
    const rows: TxAmountRow[] = [{ occurred_on: '2026-06-30', amount_cents: 100 }]
    const { months } = summarizeTransactions(rows)
    // June's clipped bucket runs Jun 29–30 (Mon–Tue) but only Jun 30 has data;
    // the label still reflects the clipped calendar span, not the data span.
    expect(months[0].weeks[0].rangeLabel).toBe('Jun 29 – Jun 30')
  })

  it('handles an empty list', () => {
    const { months, weekIndex } = summarizeTransactions([])
    expect(months).toEqual([])
    expect(weekIndex.size).toBe(0)
  })
})
