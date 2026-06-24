// Marketing payout dashboard — Sweet Dreams revenue share.
//
// Three blocks on this page:
//   1. Current-month summary card with stat tiles and the bracket breakdown
//      (or an empty state with a CTA if the month hasn't been calculated yet)
//   2. Recalculate / Mark as Paid actions tied to that current-month row
//   3. History table of every prior calculation, with inline mark-paid
//
// Server component — all data is fetched once on the server with the admin
// client (so we don't have to wrestle with RLS for read-only display).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BracketBreakdown } from '@/lib/payouts'
import type { Database, Json } from '@/lib/supabase/types'
import RecalculateButton from './RecalculateButton'
import MarkPaidButton from './MarkPaidButton'

type AdminRole = Database['public']['Enums']['admin_role']
type CalculationRow =
  Database['public']['Tables']['marketing_payout_calculations']['Row']

// ---- Currency / date helpers ----------------------------------------------
// Kept inline rather than adding a util file — these are only used here.

// $10,000.00 — never pad with extra zeros, always 2 decimals, US locale.
function formatCurrencyCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

// "June 2026" from (year, 1-indexed month).
function formatPeriod(year: number, month: number): string {
  const name = MONTH_NAMES[month - 1] ?? `Month ${month}`
  return `${name} ${year}`
}

// Eastern-time "current month" so the default view matches Mark's calendar.
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

// "Just now" / "5 min ago" / "Jun 12, 2:34 PM Eastern". Kept short so the
// stat tile doesn't wrap. Past 6 hours we just show the calendar timestamp.
function formatRelativeTime(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso
  const diffMs = Date.now() - then.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 6) return `${diffHr} hr ago`
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(then)
}

// The DB stores breakdown as Json — narrow it back to BracketBreakdown[] for
// rendering. We can't statically guarantee the JSON matches, so render
// defensively (filter to plausibly-shaped objects).
function parseBreakdown(raw: Json | null): BracketBreakdown[] {
  if (!Array.isArray(raw)) return []
  const out: BracketBreakdown[] = []
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).bracketLabel === 'string' &&
      typeof (item as Record<string, unknown>).ratePercent === 'number' &&
      typeof (item as Record<string, unknown>).revenueInBracketCents === 'number' &&
      typeof (item as Record<string, unknown>).payoutCents === 'number'
    ) {
      out.push(item as unknown as BracketBreakdown)
    }
  }
  return out
}

interface AdminUserRow {
  id: string
  role: AdminRole
}

// ---- Page ------------------------------------------------------------------
export default async function MarketingPayoutPage() {
  // Auth: redundant with the layout, but we need the role for owner-gated UI.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const admin = createAdminClient()
  const { data: adminUser } = await admin
    .from('admin_users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .maybeSingle<AdminUserRow>()

  if (!adminUser) redirect('/admin/login?error=not_authorized')

  const isOwner = adminUser.role === 'owner'

  // Pull every calculation row — table is one-per-month so this stays tiny
  // for years. Newest first.
  const { data: allRows, error: rowsErr } = await admin
    .from('marketing_payout_calculations')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (rowsErr) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <p className="telemetry-text text-apex-red">
          Failed to load marketing payouts: {rowsErr.message}
        </p>
      </div>
    )
  }

  const rows: CalculationRow[] = allRows ?? []

  const current = getEasternYearMonth()
  const currentRow =
    rows.find(
      (r) => r.period_year === current.year && r.period_month === current.month
    ) ?? null

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
      {/* ---- Header ---- */}
      <header className="mb-8">
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">
          // Sweet Dreams Revenue Share
        </p>
        <h1 className="racing-headline text-4xl lg:text-5xl text-grid-white">
          Marketing <span className="text-apex-red">Payout</span>
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-3 max-w-2xl">
          Marginal-band split on gross monthly revenue. Recalculate whenever
          new transactions land; mark paid once the wire has cleared.
        </p>
      </header>

      {/* ---- Current month block ---- */}
      <CurrentMonthBlock
        year={current.year}
        month={current.month}
        row={currentRow}
        isOwner={isOwner}
      />

      <div className="section-divider my-12" aria-hidden="true" />

      {/* ---- History table ---- */}
      <HistorySection
        rows={rows}
        currentYear={current.year}
        currentMonth={current.month}
        isOwner={isOwner}
      />
    </div>
  )
}

// ---- Current-month block ---------------------------------------------------
interface CurrentMonthBlockProps {
  year: number
  month: number
  row: CalculationRow | null
  isOwner: boolean
}

function CurrentMonthBlock({ year, month, row, isOwner }: CurrentMonthBlockProps) {
  const periodLabel = formatPeriod(year, month)

  if (!row) {
    // Empty state — no calculation yet for the current month. Make the CTA
    // big and friendly so it doesn't read like an error.
    return (
      <section aria-label="Current month — not yet calculated">
        <div className="card-dark p-10 flex flex-col items-center text-center gap-6">
          <div>
            <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
              {periodLabel}
            </p>
            <h2 className="racing-headline text-3xl text-grid-white">
              No payout calculated yet
            </h2>
            <p className="telemetry-text text-sm text-pit-gray mt-3 max-w-md">
              Run a calculation to total gross revenue for {periodLabel} and
              apply the Sweet Dreams marginal bands.
            </p>
          </div>
          <RecalculateButton
            year={year}
            month={month}
            label={`Calculate ${periodLabel} Payout`}
          />
        </div>
      </section>
    )
  }

  const breakdown = parseBreakdown(row.bracket_breakdown)
  const status: 'paid' | 'calculated' = row.paid ? 'paid' : 'calculated'

  return (
    <section aria-labelledby="current-month-heading">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
            // Current Period
          </p>
          <h2
            id="current-month-heading"
            className="racing-headline text-2xl lg:text-3xl text-grid-white"
          >
            Marketing Payout — <span className="text-apex-red">{periodLabel}</span>
          </h2>
        </div>
        <RecalculateButton year={year} month={month} variant="secondary" />
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Gross Revenue"
          value={formatCurrencyCents(row.gross_revenue_cents)}
          helper="This month, all sources"
          accentClass="text-grid-white"
        />
        <StatCard
          label="Sweet Dreams Payout"
          value={formatCurrencyCents(row.computed_payout_cents)}
          helper="Per marginal-band split"
          accentClass="text-apex-red"
        />
        <StatCard
          label="Status"
          value={status === 'paid' ? 'Paid' : 'Calculated'}
          helper={status === 'paid' ? 'Recorded in ledger' : 'Awaiting payment'}
          accentClass={status === 'paid' ? 'text-telemetry-cyan' : 'text-grid-white'}
        />
        <StatCard
          label="Last Calculated"
          value={formatRelativeTime(row.calculated_at)}
          helper="Eastern time"
          accentClass="text-pit-gray"
          valueSize="small"
        />
      </div>

      {/* Bracket breakdown table */}
      <div className="card-dark p-6 mb-6">
        <h3 className="racing-headline text-lg text-grid-white mb-4">
          Bracket <span className="text-telemetry-cyan">Breakdown</span>
        </h3>
        <BracketTable breakdown={breakdown} />
      </div>

      {/* Mark as Paid — only when calculated but not paid, and owner only */}
      {status === 'calculated' && (
        <div className="flex flex-col items-start gap-2">
          {isOwner ? (
            <MarkPaidButton
              calculationId={row.id}
              periodLabel={periodLabel}
              payoutLabel={formatCurrencyCents(row.computed_payout_cents)}
            />
          ) : (
            <p className="telemetry-text text-xs text-pit-gray italic">
              Only the owner can mark payouts as paid.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ---- Stat tile (local to this page) ---------------------------------------
interface StatCardProps {
  label: string
  value: string
  helper?: string
  accentClass: string
  valueSize?: 'large' | 'small'
}

function StatCard({
  label,
  value,
  helper,
  accentClass,
  valueSize = 'large',
}: StatCardProps) {
  const valueClass =
    valueSize === 'small'
      ? 'racing-headline text-2xl'
      : 'racing-headline text-3xl lg:text-4xl'
  return (
    <div className="card-dark p-5">
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-3">
        {label}
      </p>
      <p className={`${valueClass} ${accentClass} break-words`}>{value}</p>
      {helper && (
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          {helper}
        </p>
      )}
    </div>
  )
}

// ---- Bracket breakdown table ----------------------------------------------
function BracketTable({ breakdown }: { breakdown: BracketBreakdown[] }) {
  if (breakdown.length === 0) {
    return (
      <p className="telemetry-text text-sm text-pit-gray italic">
        No bracket data on record. Recalculate to populate the breakdown.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10">
            <Th>Bracket</Th>
            <Th align="right">Rate</Th>
            <Th align="right">Revenue in Bracket</Th>
            <Th align="right">Payout</Th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((row, idx) => (
            <tr
              key={`${row.bracketLabel}-${idx}`}
              className="border-b border-white/5 last:border-b-0"
            >
              <Td>
                <span className="telemetry-text text-sm text-grid-white">
                  {row.bracketLabel}
                </span>
              </Td>
              <Td align="right">
                <span className="telemetry-text text-sm text-telemetry-cyan">
                  {row.ratePercent}%
                </span>
              </Td>
              <Td align="right">
                <span className="telemetry-text text-sm text-grid-white">
                  {formatCurrencyCents(row.revenueInBracketCents)}
                </span>
              </Td>
              <Td align="right">
                <span className="telemetry-text text-sm text-apex-red font-semibold">
                  {formatCurrencyCents(row.payoutCents)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- History section -------------------------------------------------------
interface HistorySectionProps {
  rows: CalculationRow[]
  currentYear: number
  currentMonth: number
  isOwner: boolean
}

function HistorySection({
  rows,
  currentYear,
  currentMonth,
  isOwner,
}: HistorySectionProps) {
  // Hide the current month from the history table — it has its own block above.
  const historyRows = rows.filter(
    (r) => !(r.period_year === currentYear && r.period_month === currentMonth)
  )

  return (
    <section aria-labelledby="history-heading">
      <div className="mb-6">
        <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
          // Ledger
        </p>
        <h2 id="history-heading" className="racing-headline text-2xl lg:text-3xl text-grid-white">
          Payout <span className="text-telemetry-cyan">History</span>
        </h2>
      </div>

      {historyRows.length === 0 ? (
        <div className="card-dark p-8">
          <p className="telemetry-text text-sm text-pit-gray">
            No prior payouts on record. Past months will appear here once
            they&apos;ve been calculated.
          </p>
        </div>
      ) : (
        <div className="card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 bg-asphalt-dark/60">
                  <Th>Period</Th>
                  <Th align="right">Gross Revenue</Th>
                  <Th align="right">Payout</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => {
                  const periodLabel = formatPeriod(row.period_year, row.period_month)
                  const payoutLabel = formatCurrencyCents(row.computed_payout_cents)
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-white/5 last:border-b-0 hover:bg-asphalt-light/30 transition-colors"
                    >
                      <Td>
                        <span className="telemetry-text text-sm text-grid-white">
                          {periodLabel}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="telemetry-text text-sm text-grid-white">
                          {formatCurrencyCents(row.gross_revenue_cents)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="telemetry-text text-sm text-apex-red font-semibold">
                          {payoutLabel}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge paid={row.paid} />
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/admin/payouts/marketing/${row.id}`}
                            className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
                            // Detail page not built yet — link is here so the
                            // route is reserved for a future drill-in view.
                            aria-disabled="true"
                            tabIndex={-1}
                            onClick={(e) => e.preventDefault()}
                          >
                            View
                          </Link>
                          {!row.paid && isOwner && (
                            <MarkPaidButton
                              calculationId={row.id}
                              periodLabel={periodLabel}
                              payoutLabel={payoutLabel}
                              variant="compact"
                            />
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function StatusBadge({ paid }: { paid: boolean }) {
  if (paid) {
    return (
      <span className="inline-flex items-center gap-1.5 telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider">
        <span aria-hidden="true">{'✓'}</span> Paid
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 telemetry-text text-xs text-apex-red uppercase tracking-wider">
      <span aria-hidden="true">{'⏳'}</span> Pending
    </span>
  )
}

// ---- Tiny table primitives -------------------------------------------------
function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  // Tailwind JIT can't see classes built from template literals, so map align
  // to literal class names that the scanner can find.
  const alignClass = align === 'right' ? 'text-right' : 'text-left'
  return (
    <th
      scope="col"
      className={`px-4 py-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider font-normal ${alignClass}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left'
  return <td className={`px-4 py-3 ${alignClass}`}>{children}</td>
}
