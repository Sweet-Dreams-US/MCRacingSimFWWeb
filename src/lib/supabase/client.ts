// Browser-side Supabase client. Uses the publishable (anon) key — RLS protects
// all data. Use this in client components for things like the admin login form.
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
