// POST /api/admin/payouts/marketing/recalculate
//
// Sums gross revenue for a given month (defaults to current month, Eastern
// time) and upserts a marketing_payout_calculations row with the resulting
// Sweet Dreams payout. Owners and the Sweet Dreams role can both run this —
// it's a pure read-and-store operation that doesn't create any money
// transactions yet (that happens in /[id]/mark-paid).
//
// Body (all optional): { year?: number, month?: number (1-12) }
//
// Gross revenue = SUM(amount_cents) WHERE
//   type IN ('booking_income', 'no_show_fee', 'in_person_sale', 'other_income')
//   AND occurred_on BETWEEN <start of month> AND <end of month>
//   AND soft_deleted_at IS NULL
//
// We page through transactions in chunks of 1000 because Supabase's PostgREST
// can't do server-side SUM unless we wrap it in an RPC, and the row count for
// a single month will always be well under a few thousand.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateMarketingPayout } from '@/lib/payouts'
import type { Database, Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'

type TransactionType = Database['public']['Enums']['transaction_type']

// Anything in this set counts toward gross monthly revenue for the payout calc.
const REVENUE_TYPES: readonly TransactionType[] = [
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
] as const

// Eastern time helper — Mark's books are kept on local Fort Wayne calendar
// dates, so "current month" needs to be Eastern, not UTC. We use Intl rather
// than a tz library because dropping a dependency wasn't part of the brief.
function getEasternYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date())
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year, month }
}

// Build the inclusive YYYY-MM-DD date range for a given calendar month.
// occurred_on is a DATE column (no tz), so string comparison works correctly.
function monthDateRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${year}-${pad(month)}-01`
  // Last day of the month — Date(year, month, 0) gives the last day of month-1
  // when month is 1-indexed, which is exactly what we want here.
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${pad(month)}-${pad(lastDay)}`
  return { start, end }
}

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
    const now = getEasternYearMonth()
    year ??= now.year
    month ??= now.month
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid period — year and month must be integers, month 1-12' },
      { status: 400 }
    )
  }

  // ---- Sum gross revenue for the period ------------------------------------
  const admin = createAdminClient()
  const { start, end } = monthDateRange(year, month)

  // Page through transactions. We expect ~hundreds of rows per month at scale;
  // 1000-row pages give us 10x headroom before this becomes a problem.
  const PAGE_SIZE = 1000
  let from = 0
  let grossCents = 0
  // Guard against runaway pagination if something goes very wrong with the
  // range query. 50 pages × 1000 = 50K rows per month is a hard ceiling well
  // beyond plausible volume.
  for (let page = 0; page < 50; page++) {
    const { data: rows, error: txErr } = await admin
      .from('transactions')
      .select('amount_cents')
      .in('type', REVENUE_TYPES as unknown as TransactionType[])
      .gte('occurred_on', start)
      .lte('occurred_on', end)
      .is('soft_deleted_at', null)
      .range(from, from + PAGE_SIZE - 1)

    if (txErr) {
      return NextResponse.json(
        { error: `Failed to read transactions: ${txErr.message}` },
        { status: 500 }
      )
    }
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      grossCents += row.amount_cents
    }

    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  // ---- Run the calculator --------------------------------------------------
  // The calculator throws if it gets a non-integer or negative. In practice
  // amount_cents is always a positive integer in the DB, but we belt-and-
  // suspenders this so a corrupt row surfaces as a 500 rather than a crash.
  let payoutResult
  try {
    payoutResult = calculateMarketingPayout(grossCents)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Calculator rejected gross revenue: ${message}` },
      { status: 500 }
    )
  }

  // ---- Upsert the calculation row ------------------------------------------
  // There's a unique (period_year, period_month) constraint on the table so
  // we can let Postgres handle the merge. We re-write calculated_at on every
  // recalc — the displayed timestamp should always reflect the latest run.
  const { error: upsertErr } = await admin
    .from('marketing_payout_calculations')
    .upsert(
      {
        period_year: year,
        period_month: month,
        gross_revenue_cents: grossCents,
        computed_payout_cents: payoutResult.payoutCents,
        bracket_breakdown: payoutResult.breakdown as unknown as Json,
        calculated_at: new Date().toISOString(),
      },
      { onConflict: 'period_year,period_month' }
    )

  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to save calculation: ${upsertErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    period_year: year,
    period_month: month,
    gross_revenue_cents: grossCents,
    computed_payout_cents: payoutResult.payoutCents,
    breakdown: payoutResult.breakdown,
  })
}
