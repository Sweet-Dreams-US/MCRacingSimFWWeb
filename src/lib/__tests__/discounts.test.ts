import { describe, it, expect } from 'vitest'
import { validateDiscount, normalizeCode } from '../discounts'

// A tiny fake of the Supabase admin client covering exactly the two queries
// validateDiscount makes: the discount_codes lookup (.maybeSingle) and the
// discount_redemptions list (awaited directly).
function fakeSupabase(opts: { code?: Record<string, unknown> | null; redemptions?: Array<{ customer_id: string | null }> }) {
  return {
    from(table: string) {
      const data = table === 'discount_codes' ? opts.code ?? null : opts.redemptions ?? []
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data, error: null }),
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve({ data, error: null }),
      }
      return builder
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

function baseCode(over: Record<string, unknown> = {}) {
  return {
    id: 'dc_1',
    code: 'SAVE20',
    code_upper: 'SAVE20',
    kind: 'percent',
    percent_off: 20,
    amount_off_cents: null,
    applies_to: 'session',
    active: true,
    expires_at: null,
    max_redemptions: null,
    redemption_count: 0,
    max_total_hours: null,
    hours_redeemed: 0,
    max_hours_per_booking: null,
    owner_customer_id: null,
    max_distinct_customers: null,
    distinct_customer_count: 0,
    ...over,
  }
}

const ctx = { priceCents: 5000, hours: 1, appliesTo: 'session' as const }

describe('normalizeCode', () => {
  it('trims + uppercases', () => {
    expect(normalizeCode('  save20 ')).toBe('SAVE20')
  })
})

describe('validateDiscount — happy paths', () => {
  it('percent off floors correctly', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode() }), 'save20', ctx)
    expect(r.ok).toBe(true)
    expect(r.discountCents).toBe(1000) // floor(5000 * 20 / 100)
  })
  it('percent floors non-round amounts', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ percent_off: 33 }) }), 'x', { ...ctx, priceCents: 999 })
    expect(r.discountCents).toBe(329) // floor(999*33/100)=329.67→329
  })
  it('fixed amount', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ kind: 'fixed', percent_off: null, amount_off_cents: 1500 }) }), 'x', ctx)
    expect(r.ok).toBe(true)
    expect(r.discountCents).toBe(1500)
  })
  it('fixed is clamped to the price (never exceeds it)', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ kind: 'fixed', percent_off: null, amount_off_cents: 9000 }) }), 'x', ctx)
    expect(r.ok).toBe(true)
    expect(r.discountCents).toBe(5000) // clamped to priceCents
  })
})

describe('validateDiscount — rejections', () => {
  it('empty code', async () => {
    const r = await validateDiscount(fakeSupabase({ code: null }), '  ', ctx)
    expect(r.ok).toBe(false)
  })
  it('unknown code', async () => {
    const r = await validateDiscount(fakeSupabase({ code: null }), 'NOPE', ctx)
    expect(r.ok).toBe(false)
  })
  it('inactive', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ active: false }) }), 'x', ctx)
    expect(r.ok).toBe(false)
  })
  it('expired', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ expires_at: '2000-01-01T00:00:00Z' }) }), 'x', ctx)
    expect(r.ok).toBe(false)
  })
  it('applies_to mismatch (party code on a session)', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ applies_to: 'party' }) }), 'x', ctx)
    expect(r.ok).toBe(false)
  })
  it('max_redemptions reached', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ max_redemptions: 5, redemption_count: 5 }) }), 'x', ctx)
    expect(r.ok).toBe(false)
  })
  it('max_total_hours would be exceeded', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ max_total_hours: 6, hours_redeemed: 5 }) }), 'x', { ...ctx, hours: 2 })
    expect(r.ok).toBe(false)
  })
  it('max_hours_per_booking exceeded (referral covers up to 2h, session is 3h)', async () => {
    const r = await validateDiscount(fakeSupabase({ code: baseCode({ max_hours_per_booking: 2 }) }), 'x', { ...ctx, hours: 3 })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/up to 2 hour/i)
  })
  it("owner can't redeem their own referral code", async () => {
    const r = await validateDiscount(
      fakeSupabase({ code: baseCode({ owner_customer_id: 'cust_1' }) }),
      'x',
      { ...ctx, customerId: 'cust_1' }
    )
    expect(r.ok).toBe(false)
  })
  it('distinct-customer cap reached by 3 other friends', async () => {
    const r = await validateDiscount(
      fakeSupabase({
        code: baseCode({ max_distinct_customers: 3 }),
        redemptions: [{ customer_id: 'a' }, { customer_id: 'b' }, { customer_id: 'c' }],
      }),
      'x',
      { ...ctx, customerId: 'd' } // a new 4th customer
    )
    expect(r.ok).toBe(false)
  })
  it('a already-counted customer within the distinct cap still works', async () => {
    const r = await validateDiscount(
      fakeSupabase({
        code: baseCode({ percent_off: 50, max_distinct_customers: 3 }),
        redemptions: [{ customer_id: 'a' }, { customer_id: 'b' }],
      }),
      'x',
      { ...ctx, customerId: 'a' } // already in the set
    )
    expect(r.ok).toBe(true)
  })
})
