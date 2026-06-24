// /admin/transactions/new — entry point for a manually-recorded transaction.
// Use case: someone walks in and pays cash, or you book them by phone, or
// you need to log a refund. Anything that doesn't flow through the online
// Stripe pipeline gets recorded here.
//
// The page itself is a thin server component (auth gate + render the form);
// all state lives in the TransactionForm client component which POSTs to the
// /api/admin/transactions route.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import TransactionForm from './TransactionForm'

export default async function NewTransactionPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/transactions"
          className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
        >
          ← Back to transactions
        </Link>
        <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white mt-2">
          New Transaction
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-2 max-w-xl">
          Manually log an income, expense, or other movement. For card-on-file
          charges, use the booking detail page; for ongoing expenses with
          receipts, prefer the Expenses tab so you can attach a photo.
        </p>
      </div>

      <TransactionForm />
    </div>
  )
}
