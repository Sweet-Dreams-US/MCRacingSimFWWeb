// /admin/payouts — owner / employee / marketing payout history.
//
// All three payout types are stored as transactions with negative amounts.
// Marketing payouts have their own dedicated calculation flow at
// /admin/payouts/marketing; this page is for ad-hoc owner draws and
// employee pay records.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PaymentMethodBadge } from '../../StatusBadge'
import {
  formatDate,
  formatDollars,
  formatTransactionType,
  type PaymentMethod,
  type TransactionType,
} from '@/lib/accounting'

const PAYOUT_TYPES: TransactionType[] = [
  'owner_payout',
  'employee_payout',
  'marketing_payout',
]

interface PayoutRow {
  id: string
  occurred_on: string
  type: TransactionType
  description: string
  payment_method: PaymentMethod
  amount_cents: number
  payout_recipient: string | null
  payout_period_start: string | null
  payout_period_end: string | null
}

export default async function PayoutsPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(
      `id, occurred_on, type, description, payment_method, amount_cents,
       payout_recipient, payout_period_start, payout_period_end`
    )
    .in('type', PAYOUT_TYPES)
    .is('soft_deleted_at', null)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return (
      <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">
            Failed to load payouts: {error.message}
          </p>
        </div>
      </div>
    )
  }

  const rows = (data ?? []) as PayoutRow[]
  const totalCents = rows.reduce((s, r) => s + r.amount_cents, 0)

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
            // Disbursements
          </p>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">
            Payouts
          </h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {rows.length} payout{rows.length === 1 ? '' : 's'} on record ·{' '}
            <span className="text-apex-red">{formatDollars(totalCents)} total</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            href="/admin/payouts/marketing"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10 transition-colors"
          >
            Marketing Calc
          </Link>
          <Link
            href="/admin/payouts/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 racing-headline text-sm uppercase tracking-wider bg-apex-red text-grid-white hover:bg-apex-red/90 transition-colors"
          >
            + New Payout
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-12 text-center">
          <p className="telemetry-text text-pit-gray">
            No payouts recorded yet.
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
                  Recipient
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Period
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
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="p-4">
                    <Link
                      href={`/admin/transactions/${r.id}`}
                      className="telemetry-text text-sm text-pit-gray hover:text-apex-red"
                    >
                      {formatDate(r.occurred_on)}
                    </Link>
                  </td>
                  <td className="p-4">
                    <span className="telemetry-text text-sm text-grid-white">
                      {formatTransactionType(r.type)}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="telemetry-text text-sm text-grid-white">
                      {r.payout_recipient ?? '—'}
                    </p>
                  </td>
                  <td className="p-4">
                    {r.payout_period_start && r.payout_period_end ? (
                      <p className="telemetry-text text-xs text-pit-gray">
                        {formatDate(r.payout_period_start)} →{' '}
                        {formatDate(r.payout_period_end)}
                      </p>
                    ) : (
                      <span className="telemetry-text text-xs text-pit-gray">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    <PaymentMethodBadge method={r.payment_method} />
                  </td>
                  <td className="p-4 text-right">
                    <span className="telemetry-text text-sm font-semibold text-apex-red">
                      {formatDollars(r.amount_cents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
