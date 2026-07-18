// /admin/leaderboards/[id] — manage one board: settings + drivers & times.
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import LeaderboardManager from './LeaderboardManager'

export const dynamic = 'force-dynamic'

export default async function LeaderboardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data: board } = await supabase
    .from('leaderboards')
    .select('id, track_name, period_label, is_active')
    .eq('id', id)
    .maybeSingle()

  if (!board) notFound()

  const { data: entries } = await supabase
    .from('leaderboard_entries')
    .select('id, display_name, time_ms, customer_id')
    .eq('leaderboard_id', id)
    .order('time_ms', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/leaderboards" className="telemetry-text text-xs text-pit-gray hover:text-grid-white">
          ← Leaderboards
        </Link>
      </div>
      <LeaderboardManager board={board} initialEntries={entries ?? []} />
    </div>
  )
}
