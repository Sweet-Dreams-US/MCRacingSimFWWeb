import { Metadata } from 'next'
import LeaguesClient from './LeaguesClient'
import CityLeaderboard, { type PublicBoard } from './CityLeaderboard'
import { createAdminClient } from '@/lib/supabase/admin'

// The leaderboard changes when the owner posts times, so keep this reasonably
// fresh rather than baking it at build time.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'City Leaderboard & Leagues',
  description:
    'The MC Racing Sim Fort Wayne city leaderboard — a new track every month, fastest laps win. Plus competitive leagues: local 3-racer heats or online time attack against drivers nationwide.',
  keywords: [
    'sim racing leaderboard Fort Wayne',
    'fastest lap Fort Wayne',
    'sim racing league Fort Wayne',
    'racing league Indiana',
    'time attack racing',
    'competitive sim racing',
  ],
  openGraph: {
    title: 'City Leaderboard & Leagues | MC Racing Sim Fort Wayne',
    description: 'A new track every month — set the fastest lap in Fort Wayne. Plus 12-week competitive leagues.',
    url: 'https://mcracingfortwayne.com/leagues',
    images: ['/assets/SimRacer.webp'],
  },
  alternates: {
    canonical: 'https://mcracingfortwayne.com/leagues',
  },
}

async function loadBoards(): Promise<PublicBoard[]> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('leaderboards')
      .select('id, track_name, period_label, is_active, leaderboard_entries(display_name, time_ms)')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    return (data ?? []).map((b) => {
      const rows = (b.leaderboard_entries ?? []) as { display_name: string; time_ms: number }[]
      return {
        id: b.id,
        trackName: b.track_name,
        periodLabel: b.period_label,
        isActive: b.is_active,
        entries: rows
          .slice()
          .sort((a, z) => a.time_ms - z.time_ms)
          .slice(0, 30)
          .map((e) => ({ name: e.display_name, timeMs: e.time_ms })),
      }
    })
  } catch {
    // Missing env at build time, etc. — render the page without the board.
    return []
  }
}

export default async function LeaguesPage() {
  const boards = await loadBoards()
  return (
    <>
      <CityLeaderboard boards={boards} />
      <LeaguesClient />
    </>
  )
}
