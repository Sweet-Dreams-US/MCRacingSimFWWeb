// /admin/reports — comprehensive financial dashboard for MC Racing Sim.
//
// Owner + Sweet Dreams only (financial data). The page is period-driven via
// URL params (?period=this_month|last_month|30d|90d|year|custom&from=&to=),
// all date math resolved in America/New_York by resolveReportPeriod().
//
// Money convention (transactions table):
//   amount_cents is SIGNED — positive = money in, negative = money out, so
//   SUM(amount_cents) over P&L rows = net. tip_cents is the tip portion that
//   is already INCLUDED inside amount_cents (for staff tip-outs, not extra
//   revenue). CASH types (cash_deposit / cash_withdrawal) have no P&L impact
//   and are excluded from profit.
//
// Sections:
//   1. Period filter + resolved range subtitle + CSV export
//   2. Headline stat cards (gross, refunds, net rev, tips, expenses, payouts,
//      net profit)
//   3. Revenue by source / by payment method
//   4. Expenses by category / payouts breakdown
//   5. Sweet Dreams marketing payout summary (calculateMarketingPayout)
//   6. Trailing-12-month revenue table
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  formatDollars,
  formatMonthYear,
  type TransactionType,
  type PaymentMethod,
} from '@/lib/accounting'
import { calculateMarketingPayout } from '@/lib/payouts'
import {
  resolveReportPeriod,
  trailingTwelveMonths,
} from '@/lib/report-periods'
import ReportPeriodPicker from './ReportPeriodPicker'

interface PageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}

interface PeriodTxRow {
  type: TransactionType
  amount_cents: number
  tip_cents: number
  tax_cents: number
  rc_cents: number
  payment_method: PaymentMethod
  expense_category_id: string | null
  expense_category: { name: string; schedule_c_line: string | null } | null
}

interface TrendTxRow {
  occurred_on: string
  type: TransactionType
  amount_cents: number
}

// Income types that count toward "gross revenue" (positive, P&L). Cash
// deposits are excluded — they're moving existing cash, not new revenue.
const GROSS_INCOME_TYPES: TransactionType[] = [
  'booking_income',
  'no_show_fee',
  'in_person_sale',
  'other_income',
]

const REVENUE_SOURCE_LABELS: { type: TransactionType; label: string }[] = [
  { type: 'booking_income', label: 'Session / Booking Income' },
  { type: 'no_show_fee', label: 'No-Show Fees' },
  { type: 'in_person_sale', label: 'In-Person Sales' },
  { type: 'other_income', label: 'Other Income' },
]

const PAYMENT_METHOD_LABELS: { method: PaymentMethod; label: string }[] = [
  { method: 'stripe_online', label: 'Stripe (Online)' },
  { method: 'stripe_terminal', label: 'In-Person (Terminal)' },
  { method: 'cash', label: 'Cash' },
  { method: 'other', label: 'Other' },
]

const PAYOUT_TYPE_LABELS: { type: TransactionType; label: string }[] = [
  { type: 'owner_payout', label: 'Owner Draws' },
  { type: 'employee_payout', label: 'Employee Pay' },
  { type: 'marketing_payout', label: 'Marketing (Sweet Dreams)' },
]

export default async function ReportsPage({ searchParams }: PageProps) {
  try {
    await requireAdmin(['owner', 'sweet_dreams'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const params = await searchParams
  const period = resolveReportPeriod(params.period, params.from, params.to)

  const supabase = createAdminClient()

  // Period rows — everything in range, joined to categories for the expense
  // breakdown. We pull tip_cents + payment_method for the tip + method cards.
  const { data: rawPeriodRows, error: periodErr } = await supabase
    .from('transactions')
    .select(
      `type, amount_cents, tip_cents, tax_cents, rc_cents, payment_method, expense_category_id,
       expense_category:expense_categories(name, schedule_c_line)`
    )
    .gte('occurred_on', period.from)
    .lte('occurred_on', period.to)
    .is('soft_deleted_at', null)
    .limit(10000)

  // Trailing-12-month rows for the monthly trend table. Queried independently
  // of the selected period (always the last 12 months).
  const trend = trailingTwelveMonths()
  const trendStart = `${trend[0].year}-${String(trend[0].month).padStart(2, '0')}-01`
  const { data: rawTrendRows, error: trendErr } = await supabase
    .from('transactions')
    .select('occurred_on, type, amount_cents')
    .gte('occurred_on', trendStart)
    .is('soft_deleted_at', null)
    .limit(50000)

  if (periodErr || trendErr) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">
            Failed to load report: {periodErr?.message ?? trendErr?.message}
          </p>
        </div>
      </div>
    )
  }

  const periodRows: PeriodTxRow[] = (rawPeriodRows ?? []).map((r) => ({
    ...r,
    expense_category: Array.isArray(r.expense_category)
      ? (r.expense_category[0] ?? null)
      : r.expense_category,
  })) as PeriodTxRow[]

  // ---- Headline aggregates -------------------------------------------------
  const sumByType = (type: TransactionType): number =>
    periodRows
      .filter((r) => r.type === type)
      .reduce((s, r) => s + r.amount_cents, 0)

  // Gross revenue = all positive income types (excludes refunds + cash moves).
  const grossRevenueCents = GROSS_INCOME_TYPES.reduce(
    (s, t) => s + sumByType(t),
    0
  )
  // Refunds are stored negative; this sum is <= 0.
  const refundsCents = sumByType('refund')
  // Net revenue = gross minus refunds (refunds already negative, so add).
  const netRevenueCents = grossRevenueCents + refundsCents
  // Tips are the tip portion already inside amount_cents (income rows only).
  const tipsCents = periodRows.reduce((s, r) => s + (r.tip_cents ?? 0), 0)
  // Sales tax collected — the tax portion already inside amount_cents. This is
  // a liability owed to the state (not revenue); surfaced so it can be remitted.
  const salesTaxCollectedCents = periodRows.reduce((s, r) => s + (r.tax_cents ?? 0), 0)
  // RC car racing upsell revenue — part of amount_cents, tracked apart from the sims.
  const rcRevenueCents = periodRows.reduce((s, r) => s + (r.rc_cents ?? 0), 0)
  // Expenses stored negative; absExpense is the positive magnitude.
  const expensesCents = sumByType('expense')
  const absExpensesCents = Math.abs(expensesCents)
  // Payouts (all three kinds) stored negative.
  const payoutsCents = PAYOUT_TYPE_LABELS.reduce(
    (s, p) => s + sumByType(p.type),
    0
  )
  const absPayoutsCents = Math.abs(payoutsCents)
  // Bottom line: net revenue - expenses - payouts (both already negative).
  const netProfitCents = netRevenueCents + expensesCents + payoutsCents

  // ---- Revenue by source ---------------------------------------------------
  const revenueBySource = REVENUE_SOURCE_LABELS.map(({ type, label }) => {
    const cents = sumByType(type)
    return {
      label,
      cents,
      pct: grossRevenueCents > 0 ? (cents / grossRevenueCents) * 100 : 0,
    }
  })

  // ---- Revenue by payment method (income + refund) -------------------------
  const incomeRefundTypes = new Set<TransactionType>([
    ...GROSS_INCOME_TYPES,
    'refund',
  ])
  const methodTotals = new Map<PaymentMethod, number>()
  for (const r of periodRows) {
    if (!incomeRefundTypes.has(r.type)) continue
    methodTotals.set(
      r.payment_method,
      (methodTotals.get(r.payment_method) ?? 0) + r.amount_cents
    )
  }
  const revenueByMethod = PAYMENT_METHOD_LABELS.map(({ method, label }) => ({
    label,
    cents: methodTotals.get(method) ?? 0,
  }))
  const totalByMethodCents = revenueByMethod.reduce((s, m) => s + m.cents, 0)

  // ---- Expenses by category ------------------------------------------------
  const expenseByCategory = new Map<
    string,
    { label: string; cents: number; scheduleC: string | null }
  >()
  for (const e of periodRows) {
    if (e.type !== 'expense') continue
    const key = e.expense_category_id ?? '__uncat__'
    const label = e.expense_category?.name ?? '(Uncategorized)'
    const scheduleC = e.expense_category?.schedule_c_line ?? null
    const cur = expenseByCategory.get(key)
    if (cur) cur.cents += e.amount_cents
    else expenseByCategory.set(key, { label, cents: e.amount_cents, scheduleC })
  }
  // Most-spent first (amounts are negative, so ascending = largest spend).
  const expenseCategories = Array.from(expenseByCategory.values()).sort(
    (a, b) => a.cents - b.cents
  )

  // ---- Payouts breakdown ---------------------------------------------------
  const payoutBreakdown = PAYOUT_TYPE_LABELS.map(({ type, label }) => ({
    label,
    cents: sumByType(type),
  }))

  // ---- Sweet Dreams marketing payout (on gross revenue) --------------------
  const marketing = calculateMarketingPayout(Math.max(0, grossRevenueCents))
  const marketingActiveBrackets = marketing.breakdown.filter(
    (b) => b.revenueInBracketCents > 0
  )

  // ---- Trailing-12-month trend ---------------------------------------------
  const trendRows: TrendTxRow[] = rawTrendRows ?? []
  const monthlyTrend = trend.map(({ year, month }) => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const rows = trendRows.filter((r) => r.occurred_on.startsWith(prefix))
    const gross = rows
      .filter((r) => GROSS_INCOME_TYPES.includes(r.type))
      .reduce((s, r) => s + r.amount_cents, 0)
    const expense = rows
      .filter((r) => r.type === 'expense')
      .reduce((s, r) => s + r.amount_cents, 0)
    const payout = rows
      .filter(
        (r) =>
          r.type === 'owner_payout' ||
          r.type === 'employee_payout' ||
          r.type === 'marketing_payout'
      )
      .reduce((s, r) => s + r.amount_cents, 0)
    const refund = rows
      .filter((r) => r.type === 'refund')
      .reduce((s, r) => s + r.amount_cents, 0)
    // Net profit = gross + refund (neg) + expense (neg) + payout (neg).
    const net = gross + refund + expense + payout
    return {
      year,
      month,
      grossCents: gross,
      expenseCents: Math.abs(expense),
      netCents: net,
    }
  })
  const maxTrendGross = Math.max(1, ...monthlyTrend.map((m) => m.grossCents))

  const exportHref = `/api/admin/reports/export?from=${encodeURIComponent(
    period.from
  )}&to=${encodeURIComponent(period.to)}`

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto space-y-8">
      {/* ---- Header ---- */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
              // Financial Overview
            </p>
            <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">
              Reports
            </h1>
            <p className="telemetry-text text-sm text-pit-gray mt-1">
              {period.label} · {period.rangeLabel}
            </p>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10 transition-colors self-start"
          >
            ↓ Download CSV
          </a>
        </div>
        <ReportPeriodPicker
          period={period.id}
          from={period.from}
          to={period.to}
        />
      </header>

      {/* ---- Headline stat cards ---- */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Gross Revenue"
          valueCents={grossRevenueCents}
          tone="cyan"
          helper="All income sources"
        />
        <StatCard
          label="Refunds"
          valueCents={refundsCents}
          tone="red"
          helper="Money returned"
        />
        <StatCard
          label="Net Revenue"
          valueCents={netRevenueCents}
          tone={netRevenueCents >= 0 ? 'green' : 'red'}
          helper="Gross minus refunds"
        />
        <StatCard
          label="Tips Collected"
          valueCents={tipsCents}
          tone="white"
          helper="Included in revenue; for staff tip-outs"
        />
        <StatCard
          label="Sales Tax Collected"
          valueCents={salesTaxCollectedCents}
          tone="white"
          helper="Owed to the state — remit separately"
        />
        <StatCard
          label="RC Car Racing"
          valueCents={rcRevenueCents}
          tone="white"
          helper="Included in revenue; upsell, not simulator time"
        />
        <StatCard
          label="Total Expenses"
          valueCents={-absExpensesCents}
          tone="red"
          helper="Operating costs"
        />
        <StatCard
          label="Total Payouts"
          valueCents={-absPayoutsCents}
          tone="red"
          helper="Owner + staff + marketing"
        />
      </section>

      {/* ---- Net Profit — the bottom line, most prominent ---- */}
      <section className="card-dark border-apex-red/60 p-8 text-center">
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-widest mb-3">
          Net Profit — {period.label}
        </p>
        <p
          className={`racing-headline text-5xl lg:text-6xl ${
            netProfitCents >= 0 ? 'text-green-400' : 'text-apex-red'
          }`}
        >
          {formatDollars(netProfitCents)}
        </p>
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          Net Revenue {formatDollars(netRevenueCents)} − Expenses{' '}
          {formatDollars(absExpensesCents)} − Payouts{' '}
          {formatDollars(absPayoutsCents)}
        </p>
      </section>

      {/* ---- Revenue breakdowns ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BreakdownCard
          title="Revenue by Source"
          accent="cyan"
          totalLabel="Gross Revenue"
          totalCents={grossRevenueCents}
        >
          {revenueBySource.every((r) => r.cents === 0) ? (
            <EmptyRow message="No revenue this period." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                {revenueBySource.map((r) => (
                  <tr
                    key={r.label}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <td className="py-2.5 telemetry-text text-sm text-grid-white">
                      {r.label}
                    </td>
                    <td className="py-2.5 telemetry-text text-xs text-pit-gray text-right tabular-nums w-16">
                      {r.pct.toFixed(0)}%
                    </td>
                    <td className="py-2.5 telemetry-text text-sm text-grid-white text-right tabular-nums">
                      {formatDollars(r.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </BreakdownCard>

        <BreakdownCard
          title="Revenue by Payment Method"
          accent="cyan"
          totalLabel="Net Collected"
          totalCents={totalByMethodCents}
        >
          {revenueByMethod.every((m) => m.cents === 0) ? (
            <EmptyRow message="No income this period." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                {revenueByMethod.map((m) => (
                  <tr
                    key={m.label}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <td className="py-2.5 telemetry-text text-sm text-grid-white">
                      {m.label}
                    </td>
                    <td
                      className={`py-2.5 telemetry-text text-sm text-right tabular-nums ${
                        m.cents >= 0 ? 'text-grid-white' : 'text-apex-red'
                      }`}
                    >
                      {formatDollars(m.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </BreakdownCard>

        <BreakdownCard
          title="Expenses by Category"
          accent="red"
          totalLabel="Total Expenses"
          totalCents={expensesCents}
        >
          {expenseCategories.length === 0 ? (
            <EmptyRow message="No expenses this period." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                {expenseCategories.map((c) => (
                  <tr
                    key={c.label}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <td className="py-2.5 telemetry-text text-sm text-grid-white">
                      {c.label}
                      {c.scheduleC && (
                        <span className="block telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
                          Sch C: {c.scheduleC}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 telemetry-text text-sm text-apex-red text-right tabular-nums">
                      {formatDollars(c.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </BreakdownCard>

        <BreakdownCard
          title="Payouts"
          accent="red"
          totalLabel="Total Payouts"
          totalCents={payoutsCents}
        >
          {payoutBreakdown.every((p) => p.cents === 0) ? (
            <EmptyRow message="No payouts this period." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody>
                {payoutBreakdown.map((p) => (
                  <tr
                    key={p.label}
                    className="border-b border-white/5 last:border-b-0"
                  >
                    <td className="py-2.5 telemetry-text text-sm text-grid-white">
                      {p.label}
                    </td>
                    <td className="py-2.5 telemetry-text text-sm text-apex-red text-right tabular-nums">
                      {formatDollars(p.cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </BreakdownCard>
      </div>

      {/* ---- Sweet Dreams marketing payout summary ---- */}
      <section className="card-dark p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-1">
              // Sweet Dreams Revenue Share
            </p>
            <h3 className="racing-headline text-xl lg:text-2xl text-grid-white">
              Marketing Payout
            </h3>
            <p className="telemetry-text text-xs text-pit-gray mt-1">
              Marginal-band split on this period&apos;s gross revenue.
            </p>
          </div>
          <Link
            href="/admin/payouts/marketing"
            className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow self-start"
          >
            Open marketing payouts →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-asphalt-dark/40 border border-white/5 p-5">
            <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Gross Revenue (period)
            </p>
            <p className="racing-headline text-2xl lg:text-3xl text-grid-white">
              {formatDollars(grossRevenueCents)}
            </p>
          </div>
          <div className="bg-asphalt-dark/40 border border-apex-red/30 p-5">
            <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Computed Payout
            </p>
            <p className="racing-headline text-2xl lg:text-3xl text-apex-red">
              {formatDollars(marketing.payoutCents)}
            </p>
          </div>
        </div>

        {marketingActiveBrackets.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal">
                  Bracket
                </th>
                <th className="py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                  Rate
                </th>
                <th className="py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                  Revenue in Band
                </th>
                <th className="py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                  Payout
                </th>
              </tr>
            </thead>
            <tbody>
              {marketingActiveBrackets.map((b, i) => (
                <tr
                  key={`${b.bracketLabel}-${i}`}
                  className="border-b border-white/5 last:border-b-0"
                >
                  <td className="py-2 telemetry-text text-sm text-grid-white">
                    {b.bracketLabel}
                  </td>
                  <td className="py-2 telemetry-text text-sm text-telemetry-cyan text-right tabular-nums">
                    {b.ratePercent}%
                  </td>
                  <td className="py-2 telemetry-text text-sm text-grid-white text-right tabular-nums">
                    {formatDollars(b.revenueInBracketCents)}
                  </td>
                  <td className="py-2 telemetry-text text-sm text-apex-red text-right tabular-nums font-semibold">
                    {formatDollars(b.payoutCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <p className="telemetry-text text-sm text-pit-gray italic">
            No payout — gross revenue is within the free band ($0 – $4,500).
          </p>
        )}
      </section>

      <div className="section-divider my-8" aria-hidden="true" />

      {/* ---- Trailing 12-month revenue table ---- */}
      <section>
        <div className="mb-4">
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
            // Trailing 12 Months
          </p>
          <h2 className="racing-headline text-2xl lg:text-3xl text-grid-white">
            Revenue by Month
          </h2>
        </div>
        <div className="card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 bg-asphalt-dark/60">
                  <th className="px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal">
                    Month
                  </th>
                  <th className="px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal min-w-[120px]">
                    Gross
                  </th>
                  <th className="px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal text-right">
                    Gross Revenue
                  </th>
                  <th className="px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal text-right">
                    Expenses
                  </th>
                  <th className="px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal text-right">
                    Net Profit
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyTrend.map((m) => {
                  const barPct = Math.round(
                    (m.grossCents / maxTrendGross) * 100
                  )
                  return (
                    <tr
                      key={`${m.year}-${m.month}`}
                      className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 telemetry-text text-sm text-grid-white whitespace-nowrap">
                        {formatMonthYear(m.year, m.month)}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className="h-2 bg-telemetry-cyan/60"
                          style={{ width: `${Math.max(barPct, m.grossCents > 0 ? 4 : 0)}%` }}
                          aria-hidden="true"
                        />
                      </td>
                      <td className="px-4 py-3 telemetry-text text-sm text-grid-white text-right tabular-nums">
                        {formatDollars(m.grossCents)}
                      </td>
                      <td className="px-4 py-3 telemetry-text text-sm text-apex-red text-right tabular-nums">
                        {m.expenseCents > 0
                          ? formatDollars(-m.expenseCents)
                          : formatDollars(0)}
                      </td>
                      <td
                        className={`px-4 py-3 telemetry-text text-sm text-right tabular-nums font-semibold ${
                          m.netCents >= 0 ? 'text-green-400' : 'text-apex-red'
                        }`}
                      >
                        {formatDollars(m.netCents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        {periodRows.length} transaction{periodRows.length === 1 ? '' : 's'} in
        the selected period.{' '}
        <Link
          href="/admin/transactions"
          className="text-telemetry-cyan hover:text-telemetry-cyan-glow"
        >
          Open ledger →
        </Link>
      </p>
    </div>
  )
}

// ---- Components ------------------------------------------------------------
type Tone = 'cyan' | 'green' | 'red' | 'white'

function toneClass(tone: Tone): string {
  switch (tone) {
    case 'cyan':
      return 'text-telemetry-cyan'
    case 'green':
      return 'text-green-400'
    case 'red':
      return 'text-apex-red'
    case 'white':
      return 'text-grid-white'
  }
}

function StatCard({
  label,
  valueCents,
  tone,
  helper,
}: {
  label: string
  valueCents: number
  tone: Tone
  helper?: string
}) {
  return (
    <div className="card-dark p-5">
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-3">
        {label}
      </p>
      <p className={`racing-headline text-2xl lg:text-3xl ${toneClass(tone)}`}>
        {formatDollars(valueCents)}
      </p>
      {helper && (
        <p className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider mt-3 leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  )
}

function BreakdownCard({
  title,
  accent,
  totalLabel,
  totalCents,
  children,
}: {
  title: string
  accent: 'cyan' | 'red'
  totalLabel: string
  totalCents: number
  children: React.ReactNode
}) {
  const accentText = accent === 'cyan' ? 'text-telemetry-cyan' : 'text-apex-red'
  return (
    <section className="card-dark p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="racing-headline text-lg text-grid-white">{title}</h3>
        <p
          className={`telemetry-text text-sm font-semibold tabular-nums ${accentText}`}
        >
          {formatDollars(totalCents)}
        </p>
      </div>
      {children}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10">
        <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
          {totalLabel}
        </span>
        <span
          className={`telemetry-text text-sm font-semibold tabular-nums ${accentText}`}
        >
          {formatDollars(totalCents)}
        </span>
      </div>
    </section>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="telemetry-text text-sm text-pit-gray italic">{message}</p>
  )
}
