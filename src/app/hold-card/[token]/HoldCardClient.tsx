'use client'

// Require-card invite: the customer consents to the no-show policy, then saves
// a card (SetupIntent + confirmSetup — no charge). The setup_intent.succeeded
// webhook confirms the booking. Consent is stamped server-side when the intent
// is created (i.e. once they've checked the box and continued).
import { useState } from 'react'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

let stripePromise: Promise<StripeJs | null> | null = null
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    stripePromise = key ? loadStripe(key) : Promise.resolve(null)
  }
  return stripePromise
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

export default function HoldCardClient({
  token,
  noShowFeeCents,
}: {
  token: string
  noShowFeeCents: number
}) {
  const [consent, setConsent] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function begin() {
    if (!consent) return
    setStarting(true)
    setError(null)
    try {
      const res = await fetch(`/api/hold-card/${token}/create-intent`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not start card setup.')
      setClientSecret(data.clientSecret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start card setup.')
    } finally {
      setStarting(false)
    }
  }

  // Step 2: card entry.
  if (clientSecret) {
    return (
      <Elements
        stripe={getStripePromise()}
        options={{
          clientSecret,
          appearance: {
            theme: 'night',
            variables: {
              colorPrimary: '#E62322',
              colorBackground: '#0D0D0D',
              colorText: '#F5F5F5',
              colorDanger: '#E62322',
              fontFamily: 'JetBrains Mono, monospace',
              borderRadius: '0px',
            },
          },
        }}
      >
        <SaveCardForm token={token} noShowFeeCents={noShowFeeCents} />
      </Elements>
    )
  }

  // Step 1: consent.
  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3 bg-asphalt-dark border border-white/10 p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span className="telemetry-text text-sm text-grid-white">
          I authorize a {dollars(noShowFeeCents)} no-show fee ($20/seat) to the card I provide if I don&apos;t show up
          and don&apos;t cancel at least 24 hours before my session. My card is <strong>not charged today</strong>.
        </span>
      </label>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={begin}
        disabled={!consent || starting}
        className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-lg hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {starting ? 'Loading…' : 'Continue to Save Card'}
      </button>
    </div>
  )
}

function SaveCardForm({ token, noShowFeeCents }: { token: string; noShowFeeCents: number }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const returnUrl = new URL(`/hold-card/${token}`, window.location.origin).toString()
    const { error: stripeError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Something went wrong saving your card. Please try again.')
      setSubmitting(false)
      return
    }
    if (setupIntent && setupIntent.status === 'succeeded') {
      setSaved(true)
      setSubmitting(false)
    }
  }

  if (saved) {
    return (
      <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-6 text-center">
        <h2 className="racing-headline text-2xl text-grid-white mb-2">
          Card <span className="text-telemetry-cyan">Saved</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          Your session is confirmed — see you trackside! 🏁
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-asphalt-dark border border-white/10 p-6">
        <p className="telemetry-text text-sm text-pit-gray mb-5">
          Held securely by Stripe. Charged only the {dollars(noShowFeeCents)} no-show fee if you don&apos;t show.
        </p>
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-lg hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Saving…
          </>
        ) : (
          'Save Card & Confirm'
        )}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Powered by Stripe. We never see or store your card details.
      </p>
    </form>
  )
}
