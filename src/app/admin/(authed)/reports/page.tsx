// /admin/reports — monthly P&L view + YTD summary.
//
// All math runs in the server component (Eastern timezone). We pull three
// query buckets:
//   1. Current period's transactions, joined to expense categories so we can
//      sub-total expenses by category.
//   2. Year-to-date aggregates for the headline summary.
//   3. The list of months that have any activity, so the picker only offers
//      navigable months (currently rendered as a simple month/year input pair).
//
// Net P&L convention: SUM(amount_cents) = net (since outflows are stored
// negative). Income / expense / payout totals are derived by filtering on type.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  formatDollars,
  formatMonthYear,
  getEasternYearMonth,
  monthBounds,
  type TransactionType,
} from '@/lib/accounting'
import ReportPeriodPicker from './ReportPeriodPicker'

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>
}

interface PeriodTxRow {
  id: string
  type: TransactionType
  amount_cents: number
  expense_category_id: string | null
  expense_category: { name: string } | null
}

interface IncomeBucket {
  label: string
  cents: number
}

const INCOME_TYPE_LABELS: { type: TransactionType; label: string }[] = [
  { type: 'booking_income', label: 'Booking Income' },
  { type: 'no_show_fee', label: 'No-Show Fees' },
  { type: 'in_person_sale', label: 'In-Person Sales' },
  { type: 'other_income', label: 'Other Income' },
  { type: 'cash_deposit', label: 'Cash Deposits' },
]

const PAYOUT_TYPE_LABELS: { type: TransactionType; label: string }[] = [
  { type: 'owner_payout', label: 'Owner Payouts' },
  { type: 'employee_payout', label: 'Employee Payouts' },
  { type: 'marketing_payout', label: 'Marketing Payouts' },
]

export default async function ReportsPage({ searchParams }: PageProps) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const params = await searchParams
  const fallback = getEasternYearMonth()
  const year = clampInt(params.year, fallback.year, 2000, 2200)
  const month = clampInt(params.month, fallback.month, 1, 12)
  const { start, end } = monthBounds(year, month)

  const supabase = createAdminClient()

  // Period rows
  const { data: rawPeriodRows, error: periodErr } = await supabase
    .from('transactions')
    .select(
      `id, type, amount_cents, expense_category_id,
       expense_category:expense_categories(name)`
    )
    .gte('occurred_on', start)
    .lte('occurred_on', end)
    .is('soft_deleted_at', null)
    .limit(5000)

  // YTD rows — same year, all months up to and including current.
  const yearStart = `${year}-01-01`
  const { data: rawYtdRows, error: ytdErr } = await supabase
    .from('transactions')
    .select('type, amount_cents')
    .gte('occurred_on', yearStart)
    .lte('occurred_on', end)
    .is('soft_deleted_at', null)
    .limit(20000)

  if (periodErr || ytdErr) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">
            Failed to load report: {periodErr?.message ?? ytdErr?.message}
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

  // ---- Period aggregates ---------------------------------------------------
  // Income: sum positive types
  const incomeBuckets: IncomeBucket[] = INCOME_TYPE_LABELS.map(({ type, label }) => ({
    label,
    cents: periodRows
      .filter((r) => r.type === type)
      .reduce((s, r) => s + r.amount_cents, 0),
  })).filter((b) => b.cents !== 0)
  const totalIncomeCents = incomeBuckets.reduce((s, b) => s + b.cents, 0)

  // Expenses grouped by category (amounts are negative; sum and display absolute).
  const expenseRows = periodRows.filter((r) => r.type === 'expense')
  const expenseByCategory = new Map<string, { label: string; cents: number }>()
  for (const e of expenseRows) {
    const key = e.expense_category_id ?? '__uncat__'
    const label = e.expense_category?.name ?? '(Uncategorized)'
    const cur = expenseByCategory.get(key)
    if (cur) {
      cur.cents += e.amount_cents
    } else {
      expenseByCategory.set(key, { label, cents: e.amount_cents })
    }
  }
  const expenseBuckets = Array.from(expenseByCategory.values()).sort(
    (a, b) => a.cents - b.cents
  ) // most negative first
  const totalExpenseCents = expenseBuckets.reduce((s, b) => s + b.cents, 0)

  // Refunds + adjustments — separate line, both can be either sign.
  const totalRefundsCents = periodRows
    .filter((r) => r.type === 'refund')
    .reduce((s, r) => s + r.amount_cents, 0)
  const totalAdjustmentsCents = periodRows
    .filter((r) => r.type === 'adjustment')
    .reduce((s, r) => s + r.amount_cents, 0)

  // Payouts
  const payoutBuckets: IncomeBucket[] = PAYOUT_TYPE_LABELS.map(({ type, label }) => ({
    label,
    cents: periodRows
      .filter((r) => r.type === type)
      .reduce((s, r) => s + r.amount_cents, 0),
  })).filter((b) => b.cents !== 0)
  const totalPayoutCents = payoutBuckets.reduce((s, b) => s + b.cents, 0)

  // Net P&L for the period
  const netPeriodCents = periodRows.reduce((s, r) => s + r.amount_cents, 0)

  // ---- YTD ---------------------------------------------------------------
  const ytdRows = rawYtdRows ?? []
  const ytdIncomeCents = ytdRows
    .filter((r) =>
      INCOME_TYPE_LABELS.some((i) => i.type === r.type)
    )
    .reduce((s, r) => s + r.amount_cents, 0)
  const ytdExpenseCents = ytdRows
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.amount_cents, 0)
  const ytdPayoutCents = ytdRows
    .filter((r) =>
      PAYOUT_TYPE_LABELS.some((p) => p.type === r.type)
    )
    .reduce((s, r) => s + r.amount_cents, 0)
  const ytdNetCents = ytdRows.reduce((s, r) => s + r.amount_cents, 0)

  const periodLabel = formatMonthYear(year, month)
  const exportHref = `/api/admin/reports/export?year=${year}&month=${month}`

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
            // Bookkeeping
          </p>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">
            Reports
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Monthly P&amp;L · {periodLabel}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <ReportPeriodPicker year={year} month={month} />
          <a
            href={exportHref}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10 transition-colors"
          >
            ↓ Download CSV
          </a>
        </div>
      </header>

      {/* Big net P&L */}
      <section className="card-dark p-8 text-center">
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-widest mb-3">
          Net P&amp;L — {periodLabel}
        </p>
        <p
          className={`racing-headline text-5xl lg:text-6xl ${
            netPeriodCents >= 0 ? 'text-green-400' : 'text-apex-red'
          }`}
        >
          {formatDollars(netPeriodCents)}
        </p>
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          Income {formatDollars(totalIncomeCents)} · Expenses{' '}
          {formatDollars(totalExpenseCents)} · Payouts{' '}
          {formatDollars(totalPayoutCents)}
        </p>
      </section>

      {/* P&L body — two columns on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReportSection title="Income" total={totalIncomeCents} positive>
          <ReportTable rows={incomeBuckets} totalLabel="Total income" total={totalIncomeCents} positive />
        </ReportSection>

        <ReportSection title="Expenses" total={totalExpenseCents}>
          <ReportTable
            rows={expenseBuckets}
            totalLabel="Total expenses"
            total={totalExpenseCents}
            emptyMessage="No expenses this period."
          />
        </ReportSection>

        <ReportSection title="Payouts" total={totalPayoutCents}>
          <ReportTable
            rows={payoutBuckets}
            totalLabel="Total payouts"
            total={totalPayoutCents}
            emptyMessage="No payouts this period."
          />
        </ReportSection>

        <ReportSection
          title="Refunds & Adjustments"
          total={totalRefundsCents + totalAdjustmentsCents}
        >
          <ReportTable
            rows={[
              { label: 'Refunds', cents: totalRefundsCents },
              { label: 'Adjustments', cents: totalAdjustmentsCents },
            ].filter((r) => r.cents !== 0)}
            totalLabel="Net"
            total={totalRefundsCents + totalAdjustmentsCents}
            emptyMessage="No refunds or adjustments."
          />
        </ReportSection>
      </div>

      <div className="section-divider my-8" aria-hidden="true" />

      {/* YTD summary */}
      <section>
        <h2 className="racing-headline text-2xl lg:text-3xl text-grid-white mb-4">
          Year to Date <span className="text-telemetry-cyan">({year})</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <YtdCard label="Income" valueCents={ytdIncomeCents} variant="green" />
          <YtdCard label="Expenses" valueCents={ytdExpenseCents} variant="red" />
          <YtdCard label="Payouts" valueCents={ytdPayoutCents} variant="red" />
          <YtdCard
            label="Net P&L"
            valueCents={ytdNetCents}
            variant={ytdNetCents >= 0 ? 'green' : 'red'}
            highlight
          />
        </div>
      </section>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Pulled from {periodRows.length} transaction
        {periodRows.length === 1 ? '' : 's'} this period · {ytdRows.length} YTD.{' '}
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

function clampInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < min || n > max) return fallback
  return n
}

// ---- Small components ------------------------------------------------------
function ReportSection({
  title,
  total,
  positive = false,
  children,
}: {
  title: string
  total: number
  positive?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="card-dark p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="racing-headline text-lg text-grid-white">{title}</h3>
        <p
          className={`telemetry-text text-sm font-semibold ${
            positive || total >= 0 ? 'text-green-400' : 'text-apex-red'
          }`}
        >
          {formatDollars(total)}
        </p>
      </div>
      {children}
    </section>
  )
}

function ReportTable({
  rows,
  totalLabel,
  total,
  positive = false,
  emptyMessage = 'No activity.',
}: {
  rows: { label: string; cents: number }[]
  totalLabel: string
  total: number
  positive?: boolean
  emptyMessage?: string
}) {
  if (rows.length === 0) {
    return (
      <p className="telemetry-text text-sm text-pit-gray italic">
        {emptyMessage}
      </p>
    )
  }
  return (
    <table className="w-full text-left">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-white/5 last:border-b-0">
            <td className="py-2.5 telemetry-text text-sm text-grid-white">
              {r.label}
            </td>
            <td
              className={`py-2.5 telemetry-text text-sm text-right ${
                positive || r.cents >= 0 ? 'text-grid-white' : 'text-apex-red'
              }`}
            >
              {formatDollars(r.cents)}
            </td>
          </tr>
        ))}
        <tr>
          <td className="pt-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
            {totalLabel}
          </td>
          <td
            className={`pt-3 telemetry-text text-sm text-right font-semibold ${
              positive || total >= 0 ? 'text-green-400' : 'text-apex-red'
            }`}
          >
            {formatDollars(total)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function YtdCard({
  label,
  valueCents,
  variant,
  highlight = false,
}: {
  label: string
  valueCents: number
  variant: 'green' | 'red'
  highlight?: boolean
}) {
  const color = variant === 'green' ? 'text-green-400' : 'text-apex-red'
  return (
    <div
      className={`card-dark p-5 ${
        highlight ? 'border-apex-red/40' : ''
      }`}
    >
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-3">
        {label}
      </p>
      <p className={`racing-headline text-2xl lg:text-3xl ${color}`}>
        {formatDollars(valueCents)}
      </p>
    </div>
  )
}
