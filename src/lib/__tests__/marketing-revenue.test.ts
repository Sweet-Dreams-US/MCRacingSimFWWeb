import { describe, it, expect } from 'vitest'
import { calculateMarketingPayout } from '../payouts'
import {
  monthDateRange,
  previousMonth,
  easternYearMonth,
  computeMonthlyPayout,
  refreshMarketingPayout,
} from '../marketing-revenue'

// ---------------------------------------------------------------------------
// The payout formula. These are the documented anchors plus the two September
// 2026 figures that started all this: the stale mid-month snapshot and the real
// month-end total.
// ---------------------------------------------------------------------------
describe('calculateMarketingPayout', () => {
  it('matches the documented anchor cases', () => {
    expect(calculateMarketingPayout(1_000_000).payoutCents).toBe(181_500) // $10K -> $1,815
    expect(calculateMarketingPayout(1_200_000).payoutCents).toBe(237_500) // $12K -> $2,375
    expect(calculateMarketingPayout(1_500_000).payoutCents).toBe(312_500) // $15K -> $3,125
  })

  it('pays nothing inside the free band', () => {
    expect(calculateMarketingPayout(0).payoutCents).toBe(0)
    expect(calculateMarketingPayout(450_000).payoutCents).toBe(0)
  })

  it('September 2026: the stale snapshot owed $0, the real month owes $136.79', () => {
    // What the page showed: calculated on Sept 15, never refreshed.
    expect(calculateMarketingPayout(186_180).payoutCents).toBe(0)
    // What the month actually closed at. 41,451 cents over the free band, at 33%.
    expect(calculateMarketingPayout(491_451).payoutCents).toBe(13_679)
  })
})

// ---------------------------------------------------------------------------
// Pure date helpers
// ---------------------------------------------------------------------------
describe('monthDateRange', () => {
  it('covers whole calendar months', () => {
    expect(monthDateRange(2026, 9)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(monthDateRange(2026, 12)).toEqual({ start: '2026-12-01', end: '2026-12-31' })
  })
  it('handles leap years', () => {
    expect(monthDateRange(2028, 2).end).toBe('2028-02-29')
    expect(monthDateRange(2026, 2).end).toBe('2026-02-28')
  })
})

describe('previousMonth', () => {
  it('steps back within a year and across January', () => {
    expect(previousMonth(2026, 10)).toEqual({ year: 2026, month: 9 })
    expect(previousMonth(2026, 1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('easternYearMonth', () => {
  it('flips at Eastern midnight, not UTC midnight', () => {
    // 03:00 UTC on Oct 1 is 11pm Sept 30 in Fort Wayne (EDT) -> still September.
    expect(easternYearMonth(new Date('2026-10-01T03:00:00Z'))).toEqual({ year: 2026, month: 9 })
    // 05:00 UTC is 1am Oct 1 Eastern -> October.
    expect(easternYearMonth(new Date('2026-10-01T05:00:00Z'))).toEqual({ year: 2026, month: 10 })
  })
})

// ---------------------------------------------------------------------------
// refresh logic, against an in-memory stand-in for the database client
// ---------------------------------------------------------------------------
interface CalcRow {
  id: string
  paid: boolean
  gross_revenue_cents: number
  computed_payout_cents: number
}

function fakeAdmin(opts: {
  txns: Array<{ amount_cents: number }>
  calc: CalcRow | null
  /** Simulates the owner marking the month paid between our read and our write. */
  flipPaidAfterRead?: boolean
  txnError?: string
}) {
  const log = { txnReads: 0, updates: [] as Array<Record<string, unknown>>, upserts: [] as Array<Record<string, unknown>> }

  const admin = {
    log,
    from(table: string) {
      if (table === 'transactions') {
        const b: Record<string, unknown> = {}
        for (const m of ['select', 'in', 'gte', 'lte', 'is', 'order']) b[m] = () => b
        b.range = (from: number, to: number) => {
          log.txnReads++
          if (opts.txnError) return Promise.resolve({ data: null, error: { message: opts.txnError } })
          return Promise.resolve({ data: opts.txns.slice(from, to + 1), error: null })
        }
        return b
      }

      // marketing_payout_calculations
      let pendingUpdate: Record<string, unknown> | null = null
      const filters: Record<string, unknown> = {}
      const b: Record<string, unknown> = {}
      b.eq = (k: string, v: unknown) => {
        filters[k] = v
        return b
      }
      b.select = () => {
        if (pendingUpdate) {
          // update(...).eq('id').eq('paid', false).select('id')
          // Behave like a real database: apply the update to whatever the
          // filters actually match — no more, no less.
          const row = opts.calc
          const ok =
            !!row &&
            (filters.id === undefined || filters.id === row.id) &&
            (filters.paid === undefined || filters.paid === row.paid)
          if (ok) log.updates.push(pendingUpdate)
          return Promise.resolve({ data: ok ? [{ id: row!.id }] : [], error: null })
        }
        return b
      }
      b.maybeSingle = () => {
        const snapshot = opts.calc ? { ...opts.calc } : null
        if (opts.flipPaidAfterRead && opts.calc) opts.calc.paid = true
        return Promise.resolve({ data: snapshot, error: null })
      }
      b.update = (row: Record<string, unknown>) => {
        pendingUpdate = row
        return b
      }
      b.upsert = (row: Record<string, unknown>) => {
        log.upserts.push(row)
        return Promise.resolve({ error: null })
      }
      return b
    },
  }
  return admin
}

const rows = (n: number, cents: number) => Array.from({ length: n }, () => ({ amount_cents: cents }))

describe('computeMonthlyPayout', () => {
  it('sums EVERY page, not just the first 1,000 rows', async () => {
    // 2,300 rows x $1.00. Stopping at the first page would report $1,000.00.
    const admin = fakeAdmin({ txns: rows(2300, 100), calc: null })
    const f = await computeMonthlyPayout(admin as never, 2026, 9)
    expect(f.grossCents).toBe(230_000)
    expect(admin.log.txnReads).toBe(3)
  })

  it('throws on a failed read instead of reporting $0 revenue', async () => {
    const admin = fakeAdmin({ txns: [], calc: null, txnError: 'connection reset' })
    await expect(computeMonthlyPayout(admin as never, 2026, 9)).rejects.toThrow(/connection reset/)
  })
})

describe('refreshMarketingPayout', () => {
  it('refreshes a stale snapshot to the real month total (the September case)', async () => {
    const admin = fakeAdmin({
      txns: [{ amount_cents: 348_499 }, { amount_cents: 142_952 }], // = 491,451
      calc: { id: 'c1', paid: false, gross_revenue_cents: 186_180, computed_payout_cents: 0 },
    })
    const out = await refreshMarketingPayout(admin as never, 2026, 9)

    expect(out.status).toBe('refreshed')
    if (out.status !== 'refreshed') return
    expect(out.changed).toBe(true)
    expect(out.previousGrossCents).toBe(186_180)
    expect(out.previousPayoutCents).toBe(0)
    expect(out.figures.grossCents).toBe(491_451)
    expect(out.figures.payoutCents).toBe(13_679)
    expect(admin.log.updates[0]).toMatchObject({
      gross_revenue_cents: 491_451,
      computed_payout_cents: 13_679,
    })
  })

  it('reports changed=false when the stored figure already matches live data', async () => {
    const admin = fakeAdmin({
      txns: [{ amount_cents: 491_451 }],
      calc: { id: 'c1', paid: false, gross_revenue_cents: 491_451, computed_payout_cents: 13_679 },
    })
    const out = await refreshMarketingPayout(admin as never, 2026, 9)
    expect(out.status === 'refreshed' && out.changed).toBe(false)
  })

  it('LOCKS a paid month: never rewrites it and never even reads revenue', async () => {
    const admin = fakeAdmin({
      txns: [{ amount_cents: 999_999 }],
      calc: { id: 'c1', paid: true, gross_revenue_cents: 569_199, computed_payout_cents: 39_336 },
    })
    const out = await refreshMarketingPayout(admin as never, 2026, 7)
    expect(out.status).toBe('skipped_paid')
    expect(admin.log.updates).toHaveLength(0)
    expect(admin.log.upserts).toHaveLength(0)
    expect(admin.log.txnReads).toBe(0)
  })

  it('does not overwrite a month the owner marks paid mid-refresh', async () => {
    const admin = fakeAdmin({
      txns: [{ amount_cents: 491_451 }],
      calc: { id: 'c1', paid: false, gross_revenue_cents: 186_180, computed_payout_cents: 0 },
      flipPaidAfterRead: true,
    })
    const out = await refreshMarketingPayout(admin as never, 2026, 9)
    expect(out.status).toBe('skipped_paid')
    expect(admin.log.updates).toHaveLength(0)
  })

  it('creates the row when the month has none yet', async () => {
    const admin = fakeAdmin({ txns: [{ amount_cents: 110_745 }], calc: null })
    const out = await refreshMarketingPayout(admin as never, 2026, 10)
    expect(out.status === 'refreshed' && out.changed).toBe(true)
    expect(out.status === 'refreshed' && out.previousGrossCents).toBeNull()
    expect(admin.log.upserts[0]).toMatchObject({
      period_year: 2026,
      period_month: 10,
      gross_revenue_cents: 110_745,
      computed_payout_cents: 0, // still inside the free band
    })
  })
})
