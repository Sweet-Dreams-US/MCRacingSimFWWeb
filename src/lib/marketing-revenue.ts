// Gross-revenue sum + payout refresh for the Sweet Dreams marketing payout.
//
// This used to live inline in the recalculate route, and the stored figure was
// only ever refreshed when someone pressed "Recalculate". September 2026 was
// calculated on the 15th (mid-month: $1,861.80) and never again, so the page
// kept showing that snapshot after the month closed at $4,914.51 — and the
// payout read $0 when about $136.79 was owed. Pulling the logic out lets the
// recalculate route, a daily refresh job, and the mark-paid guard all share one
// implementation, so a stored figure can't quietly go stale.
//
// Definition of "gross revenue" is UNCHANGED from the original route, on purpose:
// the sum of amount_cents for the four types below, as stored (so it includes
// the sales tax that POS charges add). July was paid on exactly this basis, so
// changing the base mid-stream would make months incomparable. Whether sales
// tax and party deposits SHOULD count is an agreement question, not a code one.
import type { createAdminClient } from './supabase/admin'
import type { Database, Json } from './supabase/types'
import { calculateMarketingPayout, type BracketBreakdown } from './payouts'
import { monthDateRange } from './eastern'

type Admin = ReturnType<typeof createAdminClient>
type TransactionType = Database['public']['Enums']['transaction_type']

/** Transaction types that count toward gross revenue for the payout. */
export const PAYOUT_REVENUE_TYPES: readonly TransactionType[] = [
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
]

// Date helpers live in ./eastern (shared with the Meta date-range logic); re-exported
// here so existing imports keep working.
export { monthDateRange, easternYearMonth, previousMonth } from './eastern'

// ---------------------------------------------------------------------------
// Revenue + payout
// ---------------------------------------------------------------------------

export interface MonthlyPayoutFigures {
  grossCents: number
  payoutCents: number
  breakdown: BracketBreakdown[]
}

/**
 * Sum gross revenue for a month from LIVE transactions and run the calculator.
 * Read-only. Throws on a database error so callers never mistake a failed read
 * for "$0 revenue".
 */
export async function computeMonthlyPayout(
  admin: Admin,
  year: number,
  month: number
): Promise<MonthlyPayoutFigures> {
  const { start, end } = monthDateRange(year, month)
  const PAGE_SIZE = 1000
  let grossCents = 0

  // PostgREST can't SUM without an RPC, so page through. Ordering by id keeps
  // pagination stable — an un-ordered range() can skip or repeat rows if the
  // table changes while we're walking it.
  for (let page = 0; page < 50; page++) {
    const from = page * PAGE_SIZE
    const { data: rows, error } = await admin
      .from('transactions')
      .select('amount_cents')
      .in('type', PAYOUT_REVENUE_TYPES as TransactionType[])
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .is('soft_deleted_at', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to read transactions: ${error.message}`)
    if (!rows || rows.length === 0) break
    for (const row of rows) grossCents += row.amount_cents
    if (rows.length < PAGE_SIZE) break
  }

  const { payoutCents, breakdown } = calculateMarketingPayout(grossCents)
  return { grossCents, payoutCents, breakdown }
}

export type RefreshOutcome =
  | { status: 'skipped_paid'; year: number; month: number }
  | {
      status: 'refreshed'
      year: number
      month: number
      /** False when the stored figures already matched live data. */
      changed: boolean
      previousGrossCents: number | null
      previousPayoutCents: number | null
      figures: MonthlyPayoutFigures
    }

/**
 * Recompute a month from live data and store it — unless it has already been
 * paid. A paid row is LOCKED: the ledger already holds a payout transaction for
 * the old figure, and rewriting the row underneath it would leave the record and
 * the books disagreeing.
 */
export async function refreshMarketingPayout(
  admin: Admin,
  year: number,
  month: number
): Promise<RefreshOutcome> {
  const { data: existing, error: readErr } = await admin
    .from('marketing_payout_calculations')
    .select('id, paid, gross_revenue_cents, computed_payout_cents')
    .eq('period_year', year)
    .eq('period_month', month)
    .maybeSingle()
  if (readErr) throw new Error(`Failed to read calculation: ${readErr.message}`)
  if (existing?.paid) return { status: 'skipped_paid', year, month }

  const figures = await computeMonthlyPayout(admin, year, month)
  const row = {
    gross_revenue_cents: figures.grossCents,
    computed_payout_cents: figures.payoutCents,
    bracket_breakdown: figures.breakdown as unknown as Json,
    calculated_at: new Date().toISOString(),
  }

  if (existing) {
    // `.eq('paid', false)` closes the window where the owner marks it paid
    // between our read above and this write: zero rows updated means we lost it.
    const { data: updated, error } = await admin
      .from('marketing_payout_calculations')
      .update(row)
      .eq('id', existing.id)
      .eq('paid', false)
      .select('id')
    if (error) throw new Error(`Failed to save calculation: ${error.message}`)
    if (!updated || updated.length === 0) return { status: 'skipped_paid', year, month }
  } else {
    const { error } = await admin
      .from('marketing_payout_calculations')
      .upsert(
        { period_year: year, period_month: month, ...row },
        { onConflict: 'period_year,period_month' }
      )
    if (error) throw new Error(`Failed to save calculation: ${error.message}`)
  }

  return {
    status: 'refreshed',
    year,
    month,
    changed:
      !existing ||
      existing.gross_revenue_cents !== figures.grossCents ||
      existing.computed_payout_cents !== figures.payoutCents,
    previousGrossCents: existing?.gross_revenue_cents ?? null,
    previousPayoutCents: existing?.computed_payout_cents ?? null,
    figures,
  }
}
