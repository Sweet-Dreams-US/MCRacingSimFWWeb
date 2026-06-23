// Marketing payout calculator — Sweet Dreams revenue share.
//
// Marginal bands per the June 23, 2026 agreement. Each rate applies ONLY to
// the revenue inside that band (no cliffs).
//
// Test cases (verified):
//   $10,000 → $1,815   (0 + 33% × $5,500)
//   $12,000 → $2,375   (above + 28% × $2,000)
//   $15,000 → $3,125   (above + 25% × $3,000)

interface Bracket {
  /** Upper bound of this bracket in cents (inclusive). Infinity for the top band. */
  upToCents: number
  /** Rate applied to revenue inside this bracket, as a whole-number percent. */
  ratePercent: number
  /** Human-readable label for the breakdown UI. */
  label: string
}

const BRACKETS: readonly Bracket[] = [
  { upToCents:   450_000, ratePercent:  0, label: '$0 – $4,500' },
  { upToCents: 1_000_000, ratePercent: 33, label: '$4,500 – $10,000' },
  { upToCents: 1_200_000, ratePercent: 28, label: '$10,000 – $12,000' },
  { upToCents: 1_500_000, ratePercent: 25, label: '$12,000 – $15,000' },
  { upToCents:  Infinity, ratePercent: 20, label: '$15,000+' },
] as const

export interface BracketBreakdown {
  bracketLabel: string
  ratePercent: number
  revenueInBracketCents: number
  payoutCents: number
}

export interface MarketingPayoutResult {
  /** Total payout to Sweet Dreams, in cents. */
  payoutCents: number
  /** Per-band breakdown for transparency in the admin UI. */
  breakdown: BracketBreakdown[]
}

/**
 * Compute Sweet Dreams' marketing payout from gross monthly revenue.
 *
 * @param grossCents — total gross revenue for the period, in cents.
 *                     Must be a non-negative integer.
 * @returns the payout amount + per-band breakdown for display.
 */
export function calculateMarketingPayout(grossCents: number): MarketingPayoutResult {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error(
      `calculateMarketingPayout requires a non-negative integer cents value, got ${grossCents}`
    )
  }

  let payoutCents = 0
  let consumedCents = 0
  const breakdown: BracketBreakdown[] = []

  for (let i = 0; i < BRACKETS.length; i++) {
    const { upToCents, ratePercent, label } = BRACKETS[i]
    const previousUpper = i === 0 ? 0 : BRACKETS[i - 1].upToCents
    const bandSize = upToCents - previousUpper

    const remainingCents = grossCents - consumedCents
    if (remainingCents <= 0) break

    const revenueInBracket = Math.min(remainingCents, bandSize)
    // Math.round handles fractional cents stably. Verified against the three
    // anchor test cases — no rounding drift at the documented thresholds.
    const bandPayout = Math.round((revenueInBracket * ratePercent) / 100)

    payoutCents += bandPayout
    consumedCents += revenueInBracket

    breakdown.push({
      bracketLabel: label,
      ratePercent,
      revenueInBracketCents: revenueInBracket,
      payoutCents: bandPayout,
    })
  }

  return { payoutCents, breakdown }
}

/**
 * Self-check the calculator against the documented test cases.
 * Run this from a script or as a smoke test in CI.
 */
export function verifyMarketingPayoutCalculator(): void {
  const cases = [
    { grossCents: 1_000_000, expectedPayoutCents: 181_500, label: '$10K → $1,815' },
    { grossCents: 1_200_000, expectedPayoutCents: 237_500, label: '$12K → $2,375' },
    { grossCents: 1_500_000, expectedPayoutCents: 312_500, label: '$15K → $3,125' },
    // Boundary checks
    { grossCents:          0, expectedPayoutCents:       0, label: '$0 → $0' },
    { grossCents:    450_000, expectedPayoutCents:       0, label: '$4,500 → $0 (top of free band)' },
    { grossCents:    450_001, expectedPayoutCents:       0, label: '$4,500.01 → $0 (1 cent into 33% band → rounds to 0)' },
    { grossCents:  1_600_000, expectedPayoutCents:  332_500, label: '$16K → $3,325 ($15K payout + 20% × $1K)' },
  ]

  for (const { grossCents, expectedPayoutCents, label } of cases) {
    const result = calculateMarketingPayout(grossCents)
    if (result.payoutCents !== expectedPayoutCents) {
      throw new Error(
        `Payout calc failed: ${label}. Expected ${expectedPayoutCents}, got ${result.payoutCents}`
      )
    }
  }
}
