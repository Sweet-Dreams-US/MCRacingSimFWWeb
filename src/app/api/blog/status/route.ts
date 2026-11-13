import { NextResponse } from 'next/server'
import { hasReleasedPosts } from '@/lib/blog'

// Whether the navigation should show the Blog link: true once at least one post
// has been released. Read on every request (a few small files on disk), so the
// link appears and disappears on its own without a deploy. The navigation asks
// for this in the browser instead of reading it in the root layout, so adding
// the check does not turn the rest of the site's static pages into
// regenerating ones.
export const dynamic = 'force-dynamic'

export async function GET() {
  const hasBlog = await hasReleasedPosts()
  return NextResponse.json(
    { hasBlog },
    { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=300' } },
  )
}
