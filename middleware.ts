// Next.js middleware — refreshes the Supabase auth session on /admin routes
// and the auth callback. Other routes (public booking flow, blog, etc.) skip
// this to keep cold-path latency low.
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/auth/callback',
  ],
}
