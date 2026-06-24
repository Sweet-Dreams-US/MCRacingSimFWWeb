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

const PAGE_SIZE = 50

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

  const [{ count, error: countError }, { data: rows, error: dataError }] =
    await Promise.all([
      countQuery,
      dataQuery
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1),
    ])

  if (countError || dataError) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">
            Failed to load transactions:{' '}
            {countError?.message ?? dataError?.message}
          </p>
        </div>
      </div>
    )
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const transactions = rows ?? []

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
            <tbody>
              {transactions.map((t) => {
                const isPositive = t.amount_cents >= 0
                return (
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
              })}
            </tbody>
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
