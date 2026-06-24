// /admin/payouts/new — owner-only manual payout entry. For owner draws and
// employee pay records. Marketing payouts have their own dedicated flow
// (calculation + mark-paid) under /admin/payouts/marketing.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import PayoutForm from './PayoutForm'

export default async function NewPayoutPage() {
  try {
    // Owner-only — payouts move owner cash; staff shouldn't be able to log them.
    await requireAdmin(['owner'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/payouts"
          className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
        >
          ← Back to payouts
        </Link>
        <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white mt-2">
          New Payout
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-2 max-w-xl">
          Record an owner draw or employee payment. The transaction lands in
          the ledger as an outflow.
        </p>
      </div>

      <PayoutForm />
    </div>
  )
}
