// Smoke test for the marketing payout calculator.
// Run with: npx tsx scripts/verify-payouts.ts
import {
  calculateMarketingPayout,
  verifyMarketingPayoutCalculator,
} from '../src/lib/payouts'

verifyMarketingPayoutCalculator()
console.log('✅ Marketing payout calculator: ALL TEST CASES PASS')
console.log('')
console.log('Spot-check breakdown for $12,000 gross revenue:')
const result = calculateMarketingPayout(1_200_000)
console.log(`  Total payout: $${(result.payoutCents / 100).toFixed(2)}`)
result.breakdown.forEach((b) => {
  const revenue = (b.revenueInBracketCents / 100).toFixed(2)
  const payout = (b.payoutCents / 100).toFixed(2)
  console.log(`  ${b.bracketLabel} @ ${b.ratePercent}% on $${revenue} = $${payout}`)
})
