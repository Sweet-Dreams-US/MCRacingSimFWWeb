// Shared find-or-create-customer-by-email helper. Used by the POS/terminal
// routes so a walk-in who gives an email gets linked to a customer record (and
// therefore a receipt + long-term history), creating a lightweight row if new.
import type { createAdminClient } from './supabase/admin'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export async function findOrCreateCustomerIdByEmail(
  supabase: SupabaseAdmin,
  emailRaw: string
): Promise<string | null> {
  const email = emailRaw.trim().toLowerCase()
  if (!email.includes('@')) return null

  // Exact match (not ilike — an email can contain LIKE wildcards).
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) return existing.id

  const localPart = email.split('@')[0] || 'guest'
  const { data: inserted, error } = await supabase
    .from('customers')
    .insert({
      first_name: localPart.charAt(0).toUpperCase() + localPart.slice(1),
      last_name: '(walk-in)',
      email,
      marketing_opt_in: false,
      source: 'admin',
    })
    .select('id')
    .single()

  if (error) {
    // Lost a race to a concurrent insert on the unique email index — re-read.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('customers')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      return raced?.id ?? null
    }
    return null
  }
  return inserted?.id ?? null
}
