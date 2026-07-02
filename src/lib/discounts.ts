// Discount code validation + redemption. Used by the online booking checkout,
// admin invites, and (later) the first-timer referral codes. All caps are
// generic so the same engine handles simple admin codes and the multi-use
// referral codes.
import type { createAdminClient } from './supabase/admin'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

/**
 * Thrown when a customer-supplied discount code fails validation at booking
 * time. Callers (API routes) map this to a 400 with the user-facing `message`
 * instead of a generic 500, so the checkout can show "code expired" inline.
 */
export class DiscountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscountError'
  }
}

export interface DiscountContext {
  priceCents: number
  hours: number
  appliesTo: 'session' | 'party'
  customerId?: string | null
}

export interface DiscountResult {
  ok: boolean
  reason?: string
  discountCodeId?: string
  code?: string
  discountCents: number
}

/**
 * Validate a code against a booking context and compute the discount. Never
 * throws — returns { ok:false, reason } on any problem.
 */
export async function validateDiscount(
  supabase: SupabaseAdmin,
  codeRaw: string,
  ctx: DiscountContext
): Promise<DiscountResult> {
  const code = normalizeCode(codeRaw)
  if (!code) return { ok: false, reason: 'Enter a code.', discountCents: 0 }

  const { data: dc } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('code_upper', code)
    .maybeSingle()

  if (!dc) return { ok: false, reason: "That code isn't valid.", discountCents: 0 }
  if (!dc.active) return { ok: false, reason: 'This code is no longer active.', discountCents: 0 }
  if (dc.expires_at && new Date(dc.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'This code has expired.', discountCents: 0 }
  }
  if (dc.applies_to !== 'any' && dc.applies_to !== ctx.appliesTo) {
    return {
      ok: false,
      reason: `This code only applies to ${dc.applies_to} bookings.`,
      discountCents: 0,
    }
  }
  if (dc.max_redemptions != null && dc.redemption_count >= dc.max_redemptions) {
    return { ok: false, reason: 'This code has been fully used.', discountCents: 0 }
  }
  if (dc.max_total_hours != null && dc.hours_redeemed + ctx.hours > dc.max_total_hours) {
    const left = Math.max(0, dc.max_total_hours - dc.hours_redeemed)
    return {
      ok: false,
      reason: `This code has ${left} discounted hour${left === 1 ? '' : 's'} left.`,
      discountCents: 0,
    }
  }
  // Per-booking hour cap (e.g. a referral good for "up to 2 hours"): a longer
  // session can't use it. Simpler + honest vs. partially discounting some hours.
  if (dc.max_hours_per_booking != null && ctx.hours > dc.max_hours_per_booking) {
    return {
      ok: false,
      reason: `This code covers sessions up to ${dc.max_hours_per_booking} hour${dc.max_hours_per_booking === 1 ? '' : 's'}.`,
      discountCents: 0,
    }
  }
  // Referral codes: the earner can't redeem their own code.
  if (dc.owner_customer_id && ctx.customerId && dc.owner_customer_id === ctx.customerId) {
    return { ok: false, reason: 'You can’t use your own referral code.', discountCents: 0 }
  }
  // Distinct-customer cap (e.g. referral usable by 3 friends).
  if (dc.max_distinct_customers != null && ctx.customerId) {
    const { data: reds } = await supabase
      .from('discount_redemptions')
      .select('customer_id')
      .eq('discount_code_id', dc.id)
    const distinct = new Set(
      (reds ?? []).map((r) => r.customer_id).filter((v): v is string => !!v)
    )
    if (!distinct.has(ctx.customerId) && distinct.size >= dc.max_distinct_customers) {
      return { ok: false, reason: 'This code has reached its limit.', discountCents: 0 }
    }
  }

  let discountCents = 0
  if (dc.kind === 'percent' && dc.percent_off) {
    discountCents = Math.floor((ctx.priceCents * dc.percent_off) / 100)
  } else if (dc.kind === 'fixed' && dc.amount_off_cents) {
    discountCents = dc.amount_off_cents
  }
  discountCents = Math.max(0, Math.min(discountCents, ctx.priceCents))
  if (discountCents <= 0) {
    return { ok: false, reason: 'This code gives no discount here.', discountCents: 0 }
  }

  return { ok: true, discountCodeId: dc.id, code: dc.code_upper ?? code, discountCents }
}

// Ambiguity-free alphabet (no O/0, I/1) so codes are easy to read/share aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomSuffix(len: number): string {
  let out = ''
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return out
}

export interface ReferralCodeResult {
  code: string
  discountCodeId: string
}

/**
 * Generate + persist a first-timer referral code owned by `ownerCustomerId`.
 * 50% off a session, usable by up to 3 distinct friends, 6 discounted hours
 * total, max 2 hours per booking. The owner can't redeem their own code (that
 * rule lives in validateDiscount via owner_customer_id).
 *
 * Returns null if a referral code already exists for this owner (idempotent —
 * a customer only ever earns one), so callers can safely retry.
 */
export async function createFirstTimerReferralCode(
  supabase: SupabaseAdmin,
  opts: { ownerCustomerId: string; ownerFirstName?: string | null }
): Promise<ReferralCodeResult | null> {
  // One referral per customer — if they already have one, hand it back.
  const { data: existing } = await supabase
    .from('discount_codes')
    .select('id, code')
    .eq('owner_customer_id', opts.ownerCustomerId)
    .eq('source', 'first_timer_referral')
    .maybeSingle()
  if (existing) {
    return { code: existing.code, discountCodeId: existing.id }
  }

  // Build a readable code with a name-ish prefix, retrying on the rare collision.
  const prefix = (opts.ownerFirstName ?? 'RACER')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6) || 'RACER'

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${prefix}-${randomSuffix(4)}`
    const { data: inserted, error } = await supabase
      .from('discount_codes')
      .insert({
        code,
        kind: 'percent',
        percent_off: 50,
        applies_to: 'session',
        active: true,
        owner_customer_id: opts.ownerCustomerId,
        max_distinct_customers: 3,
        max_total_hours: 6,
        max_hours_per_booking: 2,
        source: 'first_timer_referral',
        notes: `First-timer referral for ${opts.ownerFirstName ?? 'racer'}`,
      })
      .select('id, code')
      .single()

    if (!error && inserted) {
      return { code: inserted.code, discountCodeId: inserted.id }
    }
    // 23505 = unique_violation on code_upper — try a new suffix. Any other
    // error is unexpected; stop and report failure to the caller.
    if (error && error.code !== '23505') {
      console.error('createFirstTimerReferralCode insert failed:', error.message)
      return null
    }
  }
  console.error('createFirstTimerReferralCode: exhausted code attempts')
  return null
}

/**
 * Record a redemption and bump the code's counters. Call this once a booking
 * that used a code is actually confirmed.
 */
export async function recordRedemption(
  supabase: SupabaseAdmin,
  discountCodeId: string,
  opts: {
    bookingId?: string | null
    customerId?: string | null
    amountOffCents: number
    hours: number
  }
): Promise<void> {
  await supabase.from('discount_redemptions').insert({
    discount_code_id: discountCodeId,
    booking_id: opts.bookingId ?? null,
    customer_id: opts.customerId ?? null,
    amount_off_cents: opts.amountOffCents,
    hours: opts.hours,
  })

  const { data: dc } = await supabase
    .from('discount_codes')
    .select('redemption_count, hours_redeemed')
    .eq('id', discountCodeId)
    .maybeSingle()
  if (!dc) return

  const { data: reds } = await supabase
    .from('discount_redemptions')
    .select('customer_id')
    .eq('discount_code_id', discountCodeId)
  const distinct = new Set(
    (reds ?? []).map((r) => r.customer_id).filter((v): v is string => !!v)
  ).size

  await supabase
    .from('discount_codes')
    .update({
      redemption_count: (dc.redemption_count ?? 0) + 1,
      hours_redeemed: (dc.hours_redeemed ?? 0) + opts.hours,
      distinct_customer_count: distinct,
    })
    .eq('id', discountCodeId)
}
