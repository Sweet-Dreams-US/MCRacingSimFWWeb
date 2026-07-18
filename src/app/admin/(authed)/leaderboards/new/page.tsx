import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import NewLeaderboardForm from './NewLeaderboardForm'

export const dynamic = 'force-dynamic'

export default async function NewLeaderboardPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/leaderboards" className="telemetry-text text-xs text-pit-gray hover:text-grid-white">
          ← Leaderboards
        </Link>
        <h1 className="racing-headline text-3xl text-grid-white mt-2">New Leaderboard</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Start this month&apos;s track. You&apos;ll add drivers &amp; times next.
        </p>
      </div>
      <NewLeaderboardForm />
    </div>
  )
}
