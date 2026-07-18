// The Leagues page became the Leaderboard page (/leaderboard). Keep this old
// URL working — lots of blog posts link to /leagues — by redirecting.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LeaguesRedirect() {
  redirect('/leaderboard')
}
