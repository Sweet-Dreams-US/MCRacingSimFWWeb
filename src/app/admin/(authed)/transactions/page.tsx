// /admin/transactions — universal money log. Lists every non-soft-deleted
// transaction newest-first, paginated 50 per page, with type / method / date /
// search filters via URL params.
//
// Implementation notes:
//   - Server component. Reads via service-role to bypass RLS (auth gated by
//     the (authed) layout, but we re-call requireAdmin for defense-in-depth).
//   - Soft-deleted rows are filtered out — those are recoverable, not visible.
//   - Pagination uses Supabase .range(offset, offset + 49) with a parallel
//     count query so the footer can show "Page 2 of 7". A single query with
//     `count: 'exact'` would also work but the parallel call keeps the offset
//     query simpler.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentMethodBadge } from '../../StatusBadge'
import TransactionFilters from './TransactionFilters'
import {
  formatDate,
  formatDollars,
  formatTransactionType,
  isValidPaymentMethod,
  isValidTransactionType,
  type TransactionType,
  type PaymentMethod,
} from '@/lib/accounting'
import { summarizeTransactions, bucketKey } from '@/lib/transaction-summary'

const PAGE_SIZE = 50

// Cap on the rollup fetch (matches the reports page). A tiny venue is nowhere
// near this; if a filtered view ever exceeds it, the breakdown covers the
// newest 10k rows and we say so.
const SUMMARY_FETCH_CAP = 10000

interface PageProps {
  searchParams: Promise<{
    type?: string
    paymentMethod?: string
    from?: string
    to?: string
    q?: string
    page?: string
  }>
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const params = await searchParams
  const type: TransactionType | '' =
    params.type && isValidTransactionType(params.type) ? params.type : ''
  const paymentMethod: PaymentMethod | '' =
    params.paymentMethod && isValidPaymentMethod(params.paymentMethod)
      ? params.paymentMethod
      : ''
  const from = params.from ?? ''
  const to = params.to ?? ''
  const q = params.q ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createAdminClient()

  // Build count + data queries with the same predicates. We don't share the
  // filter logic via a helper because Supabase's typed query builders return
  // different concrete types from .select() depending on the column list,
  // and re-narrowing them through a generic helper trips strict-mode TS.
  // The chains are short enough that the duplication is cheap.
  const qTrim = q.trim()

  let countQuery = supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .is('soft_deleted_at', null)
  if (type) countQuery = countQuery.eq('type', type)
  if (paymentMethod) countQuery = countQuery.eq('payment_method', paymentMethod)
  if (from) countQuery = countQuery.gte('occurred_on', from)
  if (to) countQuery = countQuery.lte('occurred_on', to)
  if (qTrim) countQuery = countQuery.ilike('description', `%${qTrim}%`)

  let dataQuery = supabase
    .from('transactions')
    .select(
      'id, occurred_on, type, description, payment_method, amount_cents, vendor'
    )
    .is('soft_deleted_at', null)
  if (type) dataQuery = dataQuery.eq('type', type)
  if (paymentMethod) dataQuery = dataQuery.eq('payment_method', paymentMethod)
  if (from) dataQuery = dataQuery.gte('occurred_on', from)
  if (to) dataQuery = dataQuery.lte('occurred_on', to)
  if (qTrim) dataQuery = dataQuery.ilike('description', `%${qTrim}%`)

  // Rollup query: the SAME filters, but the whole matching set (not just this
  // page), only the columns we need to tally. Powers the by-month/week
  // breakdown and the inline per-week dividers, so those totals reflect every
  // matching transaction regardless of which page you're on.
  let summaryQuery = supabase
    .from('transactions')
    .select('occurred_on, amount_cents')
    .is('soft_deleted_at', null)
  if (type) summaryQuery = summaryQuery.eq('type', type)
  if (paymentMethod) summaryQuery = summaryQuery.eq('payment_method', paymentMethod)
  if (from) summaryQuery = summaryQuery.gte('occurred_on', from)
  if (to) summaryQuery = summaryQuery.lte('occurred_on', to)
  if (qTrim) summaryQuery = summaryQuery.ilike('description', `%${qTrim}%`)

  const [
    { count, error: countError },
    { data: rows, error: dataError },
    { data: summaryRows, error: summaryError },
  ] = await Promise.all([
    countQuery,
    dataQuery
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    summaryQuery
      // Same ordering as the ledger so, in the (years-away) event the 10k cap
      // is hit, the boundary is cut deterministically at a row edge rather than
      // mid-date.
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(SUMMARY_FETCH_CAP),
  ])

  if (countError || dataError || summaryError) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">
            Failed to load transactions:{' '}
            {countError?.message ?? dataError?.message ?? summaryError?.message}
          </p>
        </div>
      </div>
    )
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const transactions = rows ?? []

  // Roll the full filtered set into months → weeks for the breakdown panel and
  // the inline per-week dividers in the ledger below.
  const summary = summarizeTransactions(summaryRows ?? [])
  const summaryCapped = (summaryRows?.length ?? 0) >= SUMMARY_FETCH_CAP

  // Build a "?...&page=N" link preserving existing filters.
  function pageHref(n: number): string {
    const p = new URLSearchParams()
    if (type) p.set('type', type)
    if (paymentMethod) p.set('paymentMethod', paymentMethod)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (q) p.set('q', q)
    if (n > 1) p.set('page', String(n))
    const qs = p.toString()
    return qs ? `?${qs}` : '?'
  }

  // Build the ledger body, inserting a per-week divider row whenever the
  // (month, week) bucket changes as we walk this page newest-first. Each
  // divider shows the FULL clipped-week total from the rollup (weekIndex), so
  // it stays accurate even when a week is split across pages.
  const ledgerNodes: JSX.Element[] = []
  let prevBucket: string | null = null
  for (const t of transactions) {
    const key = bucketKey(t.occurred_on)
    if (key !== prevBucket) {
      const wt = summary.weekIndex.get(key)
      ledgerNodes.push(
        <tr
          key={`wk-${key}`}
          className="bg-asphalt-dark/80 border-y border-telemetry-cyan/20"
        >
          <td colSpan={5} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex-1 min-w-[140px] flex flex-wrap items-baseline gap-x-2">
                <span className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider">
                  Week of {wt?.rangeLabel ?? formatDate(t.occurred_on)}
                </span>
                {wt && (
                  <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
                    whole-week total
                  </span>
                )}
              </span>
              {wt && (
                <>
                  <span className="telemetry-text text-[11px] text-pit-gray tabular-nums">
                    {wt.count} txn{wt.count === 1 ? '' : 's'}
                  </span>
                  {wt.inCents > 0 && (
                    <span className="telemetry-text text-[11px] text-green-400 tabular-nums">
                      In {formatDollars(wt.inCents)}
                    </span>
                  )}
                  {wt.outCents > 0 && (
                    <span className="telemetry-text text-[11px] text-apex-red tabular-nums">
                      Out {formatDollars(-wt.outCents)}
                    </span>
                  )}
                  <span
                    className={`telemetry-text text-xs font-semibold tabular-nums ${
                      wt.netCents >= 0 ? 'text-green-400' : 'text-apex-red'
                    }`}
                  >
                    Net {formatDollars(wt.netCents)}
                  </span>
                </>
              )}
            </div>
          </td>
        </tr>
      )
      prevBucket = key
    }
    const isPositive = t.amount_cents >= 0
    ledgerNodes.push(
      <tr
        key={t.id}
        className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
      >
        <td className="p-4">
          <Link
            href={`/admin/transactions/${t.id}`}
            className="telemetry-text text-sm text-pit-gray hover:text-apex-red"
          >
            {formatDate(t.occurred_on)}
          </Link>
        </td>
        <td className="p-4">
          <Link
            href={`/admin/transactions/${t.id}`}
            className="telemetry-text text-sm text-grid-white hover:text-apex-red"
          >
            {formatTransactionType(t.type)}
          </Link>
        </td>
        <td className="p-4 max-w-md">
          <Link
            href={`/admin/transactions/${t.id}`}
            className="block telemetry-text text-sm text-grid-white hover:text-apex-red truncate"
            title={t.description}
          >
            {t.description}
          </Link>
          {t.vendor && (
            <p className="telemetry-text text-xs text-pit-gray truncate">
              {t.vendor}
            </p>
          )}
        </td>
        <td className="p-4">
          <PaymentMethodBadge method={t.payment_method} />
        </td>
        <td className="p-4 text-right">
          <span
            className={`telemetry-text text-sm font-semibold ${
              isPositive ? 'text-green-400' : 'text-apex-red'
            }`}
          >
            {formatDollars(t.amount_cents)}
          </span>
        </td>
      </tr>
    )
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
            // Ledger
          </p>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">
            Transactions
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {total} record{total === 1 ? '' : 's'}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </p>
        </div>
        <Link
          href="/admin/transactions/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider bg-apex-red text-grid-white hover:bg-apex-red/90 transition-colors"
        >
          + New Transaction
        </Link>
      </header>

      <TransactionFilters
        initialType={type}
        initialPaymentMethod={paymentMethod}
        initialFrom={from}
        initialTo={to}
        initialQ={q}
      />

      {/* Weekly / monthly breakdown — the digest above the raw ledger. Each
          month is collapsible (native <details>); the newest is open. */}
      {summary.months.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
                // Weekly Breakdown
              </p>
              <h2 className="racing-headline text-xl lg:text-2xl text-grid-white">
                By Month &amp; Week
              </h2>
            </div>
            <p className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
              Weeks run Mon–Sun · in / out / net
              {summaryCapped && ' · newest 10k rows'}
            </p>
          </div>

          <div className="space-y-2">
            {summary.months.map((m, i) => (
              <details
                key={`${m.year}-${m.month}`}
                open={i === 0}
                className="group bg-asphalt-dark border border-white/5 overflow-hidden"
              >
                <summary className="cursor-pointer list-none select-none px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                  <span
                    className="text-pit-gray text-[10px] transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                  <span className="racing-headline text-base text-grid-white flex-1">
                    {m.label}
                  </span>
                  <span className="hidden sm:inline telemetry-text text-xs text-pit-gray tabular-nums">
                    {m.count} txn{m.count === 1 ? '' : 's'}
                  </span>
                  {m.inCents > 0 && (
                    <span className="hidden md:inline telemetry-text text-xs text-green-400 tabular-nums">
                      In {formatDollars(m.inCents)}
                    </span>
                  )}
                  {m.outCents > 0 && (
                    <span className="hidden md:inline telemetry-text text-xs text-apex-red tabular-nums">
                      Out {formatDollars(-m.outCents)}
                    </span>
                  )}
                  <span
                    className={`telemetry-text text-sm font-semibold tabular-nums w-24 text-right ${
                      m.netCents >= 0 ? 'text-green-400' : 'text-apex-red'
                    }`}
                  >
                    {formatDollars(m.netCents)}
                  </span>
                </summary>
                <div className="overflow-x-auto border-t border-white/10">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left bg-asphalt-dark/60">
                        <th className="px-4 py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal">
                          Week
                        </th>
                        <th className="px-4 py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                          Txns
                        </th>
                        <th className="px-4 py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                          In
                        </th>
                        <th className="px-4 py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                          Out
                        </th>
                        <th className="px-4 py-2 telemetry-text text-[10px] text-pit-gray uppercase tracking-wider font-normal text-right">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.weeks.map((w) => (
                        <tr
                          key={w.mondayISO}
                          className="border-b border-white/5 last:border-b-0"
                        >
                          <td className="px-4 py-2 telemetry-text text-sm text-grid-white whitespace-nowrap">
                            {w.rangeLabel}
                          </td>
                          <td className="px-4 py-2 telemetry-text text-xs text-pit-gray text-right tabular-nums">
                            {w.count}
                          </td>
                          <td className="px-4 py-2 telemetry-text text-sm text-right tabular-nums text-green-400">
                            {w.inCents > 0 ? formatDollars(w.inCents) : '—'}
                          </td>
                          <td className="px-4 py-2 telemetry-text text-sm text-right tabular-nums text-apex-red">
                            {w.outCents > 0 ? formatDollars(-w.outCents) : '—'}
                          </td>
                          <td
                            className={`px-4 py-2 telemetry-text text-sm text-right tabular-nums font-semibold ${
                              w.netCents >= 0 ? 'text-green-400' : 'text-apex-red'
                            }`}
                          >
                            {formatDollars(w.netCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {transactions.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-12 text-center">
          <p className="telemetry-text text-pit-gray">
            No transactions match these filters.
          </p>
        </div>
      ) : (
        <div className="bg-asphalt-dark border border-white/5 overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-white/10 bg-asphalt-dark/60">
              <tr className="text-left">
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Date
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Type
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Description
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Method
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>{ledgerNodes}</tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between"
        >
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="telemetry-text text-sm text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
            >
              ← Previous
            </Link>
          ) : (
            <span className="telemetry-text text-sm text-pit-gray uppercase tracking-wider opacity-50">
              ← Previous
            </span>
          )}
          <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="telemetry-text text-sm text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
            >
              Next →
            </Link>
          ) : (
            <span className="telemetry-text text-sm text-pit-gray uppercase tracking-wider opacity-50">
              Next →
            </span>
          )}
        </nav>
      )}
    </div>
  )
}
