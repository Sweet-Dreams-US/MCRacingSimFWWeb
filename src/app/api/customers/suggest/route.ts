// POST /api/customers/suggest
// Returning-customer email typeahead for the public booking / check-in forms.
// Given a typed prefix, returns known customer emails starting with it so a
// returning customer can tap their own address instead of retyping it.
//
// ⚠️ Deliberate trade-off (owner-approved): this DOES surface real customer
// emails on public-facing forms. Guardrails to blunt bulk harvesting:
//   - prefix-only match (no substring / domain scanning),
//   - 3-character minimum before anything is returned,
//   - hard cap of 5 results,
//   - only email + first name / last initial (never phone, birthday, totals,
//     Stripe ids — full prefill still requires picking the exact email, via
//     /api/checkin/lookup).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface SuggestBody {
  q?: string
}

/** Escape LIKE wildcards so user input can't widen the pattern. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export async function POST(request: NextRequest) {
  let body: SuggestBody
  try {
    body = (await request.json()) as SuggestBody
  } catch {
    return NextResponse.json({ suggestions: [] })
  }

  const q = (body.q ?? '').trim().toLowerCase()
  if (q.length < 3 || q.length > 100) {
    return NextResponse.json({ suggestions: [] })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('customers')
    .select('email, first_name, last_name')
    .not('email', 'is', null)
    .ilike('email', `${escapeLike(q)}%`)
    .order('updated_at', { ascending: false })
    .limit(5)

  if (error || !data) {
    return NextResponse.json({ suggestions: [] })
  }

  // Dedupe by email (walk-ins can create same-email rows) and keep the name
  // to a first name + last initial so the dropdown is identifying, not a dump.
  const seen = new Set<string>()
  const suggestions: { email: string; name: string }[] = []
  for (const c of data) {
    const email = (c.email ?? '').toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    const lastInitial = c.last_name?.trim()?.[0]
    const name = [c.first_name?.trim(), lastInitial ? `${lastInitial.toUpperCase()}.` : null]
      .filter(Boolean)
      .join(' ')
    suggestions.push({ email, name })
  }

  return NextResponse.json({ suggestions })
}
