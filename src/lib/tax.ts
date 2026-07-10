// Sales tax — flat local rate applied to in-person purchases (reader + POS).
//
// We compute tax ourselves and add it to the charged total rather than using
// Stripe Tax (which needs full tax-registration setup). The rate is authoritative
// on the server; the reader/web POS display the same breakdown so the customer
// sees it before paying, and every taxed transaction stores its tax portion in
// transactions.tax_cents for remittance reporting.
//
// Indiana state sales tax is 7%. Override with SALES_TAX_RATE_BPS if it changes
// (700 = 7.00%). NOTE: the reader app has a matching constant (Pricing.kt) — if
// you change the rate here, also update + rebuild the reader.

export const SALES_TAX_RATE_BPS = (() => {
  const n = Number(process.env.SALES_TAX_RATE_BPS)
  return Number.isFinite(n) && n >= 0 ? n : 700
})()

/** Tax on a pre-tax subtotal, in cents. Rounded to the nearest cent. */
export function computeTaxCents(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0
  return Math.round((subtotalCents * SALES_TAX_RATE_BPS) / 10000)
}

/** e.g. "7%" or "7.25%" — for receipts/labels. */
export function taxRateLabel(): string {
  const pct = SALES_TAX_RATE_BPS / 100
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(2)}%`
}
