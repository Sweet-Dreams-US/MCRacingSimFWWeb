// POST /api/admin/discounts — create a discount code.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCode } from '@/lib/discounts'

export const runtime = 'nodejs'

// Human-friendly, no ambiguous characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(len = 6): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return s
}

interface Body {
  code?: string
  kind?: 'percent' | 'fixed'
  percentOff?: number
  amountOffCents?: number
  appliesTo?: 'session' | 'party' | 'any'
  expiresAt?: string | null
  maxRedemptions?: number | null
  maxDistinctCustomers?: number | null
  maxTotalHours?: number | null
  notes?: string | null
}

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const kind = body.kind === 'fixed' ? 'fixed' : 'percent'
  const appliesTo =
    body.appliesTo === 'party' || body.appliesTo === 'any' ? body.appliesTo : 'session'

  let percentOff: number | null = null
  let amountOffCents: number | null = null
  if (kind === 'percent') {
    percentOff = Math.round(Number(body.percentOff))
    if (!Number.isFinite(percentOff) || percentOff < 1 || percentOff > 100) {
      return NextResponse.json(
        { success: false, error: 'Percent off must be 1–100.' },
        { status: 400 }
      )
    }
  } else {
    amountOffCents = Math.round(Number(body.amountOffCents))
    if (!Number.isFinite(amountOffCents) || amountOffCents < 1) {
      return NextResponse.json(
        { success: false, error: 'Amount off must be a positive number.' },
        { status: 400 }
      )
    }
  }

  const code = body.code?.trim() ? normalizeCode(body.code) : randomCode()
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
    return NextResponse.json(
      { success: false, error: 'Code must be 3–24 letters/numbers.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Uniqueness (case-insensitive via code_upper).
  const { data: existing } = await supabase
    .from('discount_codes')
    .select('id')
    .eq('code_upper', code)
    .maybeSingle()
  if (existing) {
    return NextResponse.json(
      { success: false, error: `Code ${code} already exists.` },
      { status: 409 }
    )
  }

  const { data: inserted, error } = await supabase
    .from('discount_codes')
    .insert({
      code,
      kind,
      percent_off: percentOff,
      amount_off_cents: amountOffCents,
      applies_to: appliesTo,
      expires_at: body.expiresAt || null,
      max_redemptions: body.maxRedemptions ?? null,
      max_distinct_customers: body.maxDistinctCustomers ?? null,
      max_total_hours: body.maxTotalHours ?? null,
      notes: body.notes?.trim() || null,
      source: 'admin',
      created_by_user_id: adminCtx.admin.id,
    })
    .select('id, code')
    .single()

  if (error || !inserted) {
    return NextResponse.json(
      { success: false, error: `Create failed: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: inserted.id, code: inserted.code })
}
