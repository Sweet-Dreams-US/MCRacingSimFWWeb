// /admin/expenses — same shape as /admin/transactions but pre-filtered to
// type='expense'. Also joins expense_categories so we can show the IRS
// Schedule C category alongside the description.
//
// Filters available:
//   - ?categoryId= (category dropdown)
//   - ?paymentMethod=, ?from=, ?to=, ?q= (passed through to the shared
//     TransactionFilters component)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentMethodBadge } from '../../StatusBadge'
import TransactionFilters from '../transactions/TransactionFilters'
import ExpenseCategoryFilter from './ExpenseCategoryFilter'
import {
  formatDate,
  formatDollars,
  isValidPaymentMethod,
  type PaymentMethod,
} from '@/lib/accounting'

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{
    categoryId?: string
    paymentMethod?: string
    from?: string
    to?: string
    q?: string
    page?: string
  }>
}

interface ExpenseRow {
  id: string
  occurred_on: string
  description: string
  payment_method: PaymentMethod
  amount_cents: number
  vendor: string | null
  receipt_url: string | null
  expense_category_id: string | null
  expense_category: { name: string } | null
}

export default async function ExpensesPage({ searchParams }: PageProps) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const params = await searchParams
  const categoryId = params.categoryId ?? ''
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

  // Categories drive the filter dropdown and the report joins.
  const { data: categories } = await supabase
    .from('expense_categories')
    .select('id, name, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  // Both queries share the same predicate chain. We don't share the filter
  // logic via a helper because Supabase's typed query builders return different
  // concrete types from .select() depending on the column list (see same
  // comment in transactions/page.tsx).
  const qTrim = q.trim()

  let countQuery = supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'expense')
    .is('soft_deleted_at', null)
  if (categoryId) countQuery = countQuery.eq('expense_category_id', categoryId)
  if (paymentMethod) countQuery = countQuery.eq('payment_method', paymentMethod)
  if (from) countQuery = countQuery.gte('occurred_on', from)
  if (to) countQuery = countQuery.lte('occurred_on', to)
  if (qTrim) countQuery = countQuery.ilike('description', `%${qTrim}%`)

  let dataQuery = supabase
    .from('transactions')
    .select(
      `id, occurred_on, description, payment_method, amount_cents, vendor,
       receipt_url, expense_category_id,
       expense_category:expense_categories(name)`
    )
    .eq('type', 'expense')
    .is('soft_deleted_at', null)
  if (categoryId) dataQuery = dataQuery.eq('expense_category_id', categoryId)
  if (paymentMethod) dataQuery = dataQuery.eq('payment_method', paymentMethod)
  if (from) dataQuery = dataQuery.gte('occurred_on', from)
  if (to) dataQuery = dataQuery.lte('occurred_on', to)
  if (qTrim) dataQuery = dataQuery.ilike('description', `%${qTrim}%`)

  const [{ count, error: countError }, { data: rawRows, error: dataError }] =
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
            Failed to load expenses:{' '}
            {countError?.message ?? dataError?.message}
          </p>
        </div>
      </div>
    )
  }

  // Supabase relationship-join shape: expense_category comes back as an
  // array OR a single object depending on FK metadata; normalize to single.
  const expenses: ExpenseRow[] = (rawRows ?? []).map((r) => ({
    ...r,
    expense_category: Array.isArray(r.expense_category)
      ? (r.expense_category[0] ?? null)
      : r.expense_category,
  })) as ExpenseRow[]

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Total of currently-filtered rows on this page for a quick sanity check.
  const pageTotalCents = expenses.reduce((sum, e) => sum + e.amount_cents, 0)

  function pageHref(n: number): string {
    const p = new URLSearchParams()
    if (categoryId) p.set('categoryId', categoryId)
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
            // Bookkeeping
          </p>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">
            Expenses
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {total} expense{total === 1 ? '' : 's'}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
            {expenses.length > 0 && (
              <>
                {' · '}
                <span className="text-apex-red">
                  {formatDollars(pageTotalCents)} this page
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/admin/expenses/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider bg-apex-red text-grid-white hover:bg-apex-red/90 transition-colors"
        >
          + New Expense
        </Link>
      </header>

      <ExpenseCategoryFilter
        categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
        initialCategoryId={categoryId}
      />

      <TransactionFilters
        initialType="expense"
        initialPaymentMethod={paymentMethod}
        initialFrom={from}
        initialTo={to}
        initialQ={q}
        hideType
      />

      {expenses.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-12 text-center">
          <p className="telemetry-text text-pit-gray">
            No expenses match these filters.
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
                  Category
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Vendor / Description
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Method
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Receipt
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="p-4">
                    <Link
                      href={`/admin/transactions/${e.id}`}
                      className="telemetry-text text-sm text-pit-gray hover:text-apex-red"
                    >
                      {formatDate(e.occurred_on)}
                    </Link>
                  </td>
                  <td className="p-4">
                    <span className="telemetry-text text-sm text-telemetry-cyan">
                      {e.expense_category?.name ?? '(uncategorized)'}
                    </span>
                  </td>
                  <td className="p-4 max-w-md">
                    {e.vendor && (
                      <p className="telemetry-text text-sm text-grid-white truncate">
                        {e.vendor}
                      </p>
                    )}
                    <p className="telemetry-text text-xs text-pit-gray truncate" title={e.description}>
                      {e.description}
                    </p>
                  </td>
                  <td className="p-4">
                    <PaymentMethodBadge method={e.payment_method} />
                  </td>
                  <td className="p-4">
                    {e.receipt_url ? (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
                      >
                        View ↗
                      </a>
                    ) : (
                      <span className="telemetry-text text-xs text-pit-gray">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <span className="telemetry-text text-sm font-semibold text-apex-red">
                      {formatDollars(e.amount_cents)}
                    </span>
                  </td>
                </tr>
              ))}
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
