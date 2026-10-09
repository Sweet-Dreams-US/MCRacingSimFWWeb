// GET /api/cron/refresh-marketing-payouts
//
// Daily job that keeps the Sweet Dreams marketing payout figures current.
//
// Before this existed, the stored figure only changed when someone pressed
// "Recalculate". September 2026 was calculated on the 15th and never again, so
// the payouts page showed $1,861.80 / $0 owed for a month that closed at
// $4,914.51 / about $136.79 owed.
//
// Each run refreshes:
//   - the current month and the previous month (creating the row if missing), and
//   - EVERY other month that is still unpaid, so a payout that sits unpaid for a
//     while keeps absorbing late-entered or corrected transactions.
// PAID months are never touched — their ledger entry already exists.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  easternYearMonth,
  previousMonth,
  refreshMarketingPayout,
} from '@/lib/marketing-revenue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Same protection as the other cron routes: Vercel sends CRON_SECRET as a Bearer token.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const targets = new Map<string, { year: number; month: number }>()
  const add = (year: number, month: number) => targets.set(`${year}-${month}`, { year, month })

  const now = easternYearMonth()
  add(now.year, now.month)
  const prev = previousMonth(now.year, now.month)
  add(prev.year, prev.month)

  const { data: unpaid, error: unpaidErr } = await admin
    .from('marketing_payout_calculations')
    .select('period_year, period_month')
    .eq('paid', false)
  if (unpaidErr) {
    return NextResponse.json(
      { success: false, error: `Failed to list unpaid months: ${unpaidErr.message}` },
      { status: 500 }
    )
  }
  for (const r of unpaid ?? []) add(r.period_year, r.period_month)

  const results: Array<Record<string, unknown>> = []
  let failures = 0
  for (const { year, month } of Array.from(targets.values())) {
    try {
      const outcome = await refreshMarketingPayout(admin, year, month)
      results.push(
        outcome.status === 'skipped_paid'
          ? { year, month, status: 'skipped_paid' }
          : {
              year,
              month,
              status: 'refreshed',
              changed: outcome.changed,
              gross_revenue_cents: outcome.figures.grossCents,
              computed_payout_cents: outcome.figures.payoutCents,
              previous_payout_cents: outcome.previousPayoutCents,
            }
      )
    } catch (err) {
      failures++
      results.push({
        year,
        month,
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 500 on any failure so it surfaces in Vercel's cron/function logs rather than
  // looking like a quiet success.
  return NextResponse.json({ success: failures === 0, results }, { status: failures ? 500 : 200 })
}
