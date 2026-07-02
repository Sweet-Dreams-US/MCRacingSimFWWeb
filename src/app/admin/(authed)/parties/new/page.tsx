import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import NewPartyForm from './NewPartyForm'

export default async function NewPartyPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/parties" className="telemetry-text text-xs text-pit-gray hover:text-grid-white">
          ← Back to parties
        </Link>
        <h1 className="racing-headline text-3xl text-grid-white mt-2">New Party Invite</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Enter the details and quote. The customer gets a link to pay a 50% deposit online — the party confirms once
          it&apos;s paid.
        </p>
      </div>
      <NewPartyForm />
    </div>
  )
}
