// Service-role Supabase client. BYPASSES RLS — has full database access.
// Use ONLY in server-side code (API routes, Server Actions, webhook handlers).
// Never expose to the client. Never use in a Client Component.
//
// This is the trust boundary: any code that touches money flows through here.
import { createClient } from '@supabase/supabase-js'

let cached: ReturnType<typeof createClient> | null = null

export function createAdminClient() {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    )
  }

  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cached
}
