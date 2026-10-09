// POST /api/admin/payouts/marketing/recalculate
//
// Sums gross revenue for a given month (defaults to current month, Eastern
// time) and stores the resulting Sweet Dreams payout in
// marketing_payout_calculations. Owners and the Sweet Dreams role can both run
// this — it's a pure read-and-store operation that doesn't create any money
// transactions (that happens in /[id]/mark-paid).
//
// Body (all optional): { year?: number, month?: number (1-12) }
//
// The revenue sum and the refresh itself live in src/lib/marketing-revenue.ts,
// shared with the daily refresh cron and the mark-paid guard. A month that has
// already been paid is LOCKED and returns 409: its payout transaction is already
// in the ledger, so rewriting the stored figure would put the record and the
// books out of step.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { easternYearMonth, refreshMarketingPayout } from '@/lib/marketing-revenue'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // ---- Auth gate (owner or sweet_dreams) ----------------------------------
  try {
    await requireAdmin(['owner', 'sweet_dreams'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  // ---- Resolve period ------------------------------------------------------
  let year: number | undefined
  let month: number | undefined
  try {
    const body = (await request.json().catch(() => ({}))) as {
      year?: number
      month?: number
    }
    if (typeof body.year === 'number') year = body.year
    if (typeof body.month === 'number') month = body.month
  } catch {
    // Empty / invalid body is fine — we default to current Eastern month.
  }

  if (year === undefined || month === undefined) {
    const now = easternYearMonth()
    year ??= now.year
    month ??= now.month
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid period — year and month must be integers, month 1-12' },
      { status: 400 }
    )
  }

  // ---- Recompute from live transactions and store ---------------------------
  const admin = createAdminClient()
  let outcome
  try {
    outcome = await refreshMarketingPayout(admin, year, month)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  if (outcome.status === 'skipped_paid') {
    return NextResponse.json(
      {
        error:
          'That month has already been paid, so its figure is locked. ' +
          'The payout transaction is already in the ledger.',
      },
      { status: 409 }
    )
  }

  return NextResponse.json({
    success: true,
    period_year: year,
    period_month: month,
    gross_revenue_cents: outcome.figures.grossCents,
    computed_payout_cents: outcome.figures.payoutCents,
    breakdown: outcome.figures.breakdown,
    changed: outcome.changed,
  })
}
