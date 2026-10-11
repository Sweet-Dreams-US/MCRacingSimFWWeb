// Service-role Supabase client. BYPASSES RLS — has full database access.
// Use ONLY in server-side code (API routes, Server Actions, webhook handlers).
// Never expose to the client. Never use in a Client Component.
//
// This is the trust boundary: any code that touches money flows through here.
//
// Supports both key formats:
//   - SUPABASE_SECRET_KEY (sb_secret_*) — preferred, modern format
//   - SUPABASE_SERVICE_ROLE_KEY (legacy JWT) — fallback
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let cached: SupabaseClient<Database> | null = null

export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and one of ' +
        'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set'
    )
  }

  cached = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Never let Next.js's fetch cache answer a database read. A cached GET
    // made the calendar sync see the same stale "no event yet" row every
    // 15 minutes and create a new Google event each time (2026-10-10).
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  return cached
}
