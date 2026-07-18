// /admin/leaderboards — every monthly track board, newest/active first.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface BoardRow {
  id: string
  track_name: string
  period_label: string | null
  is_active: boolean
  created_at: string
  leaderboard_entries: { count: number }[]
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function LeaderboardsPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('leaderboards')
    .select('id, track_name, period_label, is_active, created_at, leaderboard_entries(count)')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  const boards = (data ?? []) as unknown as BoardRow[]

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="racing-headline text-3xl text-grid-white">Leaderboards</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Monthly track boards — the active one shows on the public Leaderboard page.
          </p>
        </div>
        <Link
          href="/admin/leaderboards/new"
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-5 py-3 transition-colors"
        >
          + New Leaderboard
        </Link>
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">Failed to load: {error.message}</p>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
          <p className="telemetry-text text-pit-gray">
            No leaderboards yet. Create one for this month&apos;s track to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {boards.map((b) => {
            const count = b.leaderboard_entries?.[0]?.count ?? 0
            return (
              <Link
                key={b.id}
                href={`/admin/leaderboards/${b.id}`}
                className="block bg-asphalt-dark border border-white/5 hover:border-apex-red/50 transition-colors p-4"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="racing-headline text-lg text-grid-white">{b.track_name}</h2>
                      {b.is_active && (
                        <span className="telemetry-text text-xs px-2 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="telemetry-text text-xs text-pit-gray mt-0.5">
                      {b.period_label ? `${b.period_label} · ` : ''}
                      Created {formatDate(b.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="racing-headline text-xl text-telemetry-cyan">{count}</p>
                    <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                      {count === 1 ? 'time' : 'times'}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
