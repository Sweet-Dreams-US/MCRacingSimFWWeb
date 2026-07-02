// POST /api/booking/validate-discount
// Public: the online booking checkout calls this to validate + price a code
// before submitting. The real redemption is recorded server-side on confirm.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateDiscount } from '@/lib/discounts'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  let body: { code?: string; priceCents?: number; hours?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'Invalid request', discountCents: 0 }, { status: 400 })
  }

  const code = (body.code ?? '').trim()
  const priceCents = Math.round(Number(body.priceCents))
  const hours = Math.round(Number(body.hours))
  if (!code || !Number.isFinite(priceCents) || priceCents <= 0) {
    return NextResponse.json({ ok: false, reason: 'Enter a code.', discountCents: 0 })
  }

  const supabase = createAdminClient()
  const result = await validateDiscount(supabase, code, {
    priceCents,
    hours: Number.isFinite(hours) ? hours : 0,
    appliesTo: 'session',
  })

  return NextResponse.json({
    ok: result.ok,
    reason: result.reason,
    code: result.code,
    discountCents: result.discountCents,
  })
}
