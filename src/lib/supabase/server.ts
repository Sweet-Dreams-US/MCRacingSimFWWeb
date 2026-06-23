// Server-side Supabase client for use in Server Components, Route Handlers,
// and Server Actions. Reads session from cookies so we know who's logged in.
// This client respects RLS — use it when acting on behalf of a user.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components cannot set cookies — that's fine.
            // Middleware refreshes the session token, so this is just defensive.
          }
        },
      },
    }
  )
}
