// Server-side Stripe SDK initialization.
// Use ONLY in server code (API routes, Server Actions, webhook handlers).
//
// This is a singleton — Stripe's client maintains a connection pool, and
// creating one per request hurts cold-start performance.
//
// Note: in Vercel preview/development environments, set STRIPE_SECRET_KEY
// to a TEST mode key (sk_test_* or rk_test_*) so feature branches don't
// touch real money.
import Stripe from 'stripe'

let cached: Stripe | null = null

export function getStripe(): Stripe {
  if (cached) return cached

  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Use rk_live_* in production, sk_test_* in dev.'
    )
  }

  cached = new Stripe(key, {
    // Pin the API version so Stripe doesn't silently change response shapes
    // on us. Bump deliberately when we want new features.
    apiVersion: '2026-05-27.dahlia',
    // Vercel Functions can be re-used across requests (Fluid Compute), so
    // keeping the default HTTP agent works well.
    typescript: true,
    appInfo: {
      name: 'mc-racing-sim-fw-web',
      version: '1.0.0',
      url: 'https://mcracingfortwayne.com',
    },
  })

  return cached
}
