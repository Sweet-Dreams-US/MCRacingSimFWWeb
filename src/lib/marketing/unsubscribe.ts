// Token-based unsubscribe / resubscribe.
//
// The token is the customer's permanent, unguessable (UUID) opt-out key. Both
// the one-click POST endpoint (List-Unsubscribe-Post) and the human-facing
// /unsubscribe page funnel through here so the behaviour is identical.

import { createAdminClient } from '../supabase/admin'

export interface UnsubResult {
  ok: boolean
  alreadyDone?: boolean
  firstName?: string | null
  email?: string | null
  error?: string
}

export async function unsubscribeByToken(token: string): Promise<UnsubResult> {
  if (!token) return { ok: false, error: 'Missing token' }
  const supabase = createAdminClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, first_name, email, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!customer) return { ok: false, error: 'Unknown unsubscribe link' }

  if (customer.unsubscribed_at) {
    return {
      ok: true,
      alreadyDone: true,
      firstName: customer.first_name,
      email: customer.email,
    }
  }

  const { error: updErr } = await supabase
    .from('customers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', customer.id)

  if (updErr) return { ok: false, error: updErr.message }

  return {
    ok: true,
    firstName: customer.first_name,
    email: customer.email,
  }
}

// Let someone opt back in from the confirmation page (their choice, no spam risk).
export async function resubscribeByToken(token: string): Promise<UnsubResult> {
  if (!token) return { ok: false, error: 'Missing token' }
  const supabase = createAdminClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select('id, first_name, email')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!customer) return { ok: false, error: 'Unknown link' }

  const { error: updErr } = await supabase
    .from('customers')
    .update({ unsubscribed_at: null })
    .eq('id', customer.id)

  if (updErr) return { ok: false, error: updErr.message }

  return { ok: true, firstName: customer.first_name, email: customer.email }
}
