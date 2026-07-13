'use client'

// Invitee deposit flow. Fetches a PaymentIntent client_secret for the party,
// mounts Stripe Elements, and takes the 50% deposit via confirmPayment (a REAL
// charge — not the $0 SetupIntent the normal booking flow uses).
import { useEffect, useState } from 'react'
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

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Breakdown {
  depositCents: number
  subtotalCents: number
  taxCents: number
}

export default function PartyDepositClient({
  token,
  depositCents,
}: {
  token: string
  depositCents: number
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Authoritative amounts come from the intent (tax-inclusive); seed with the
  // pre-tax prop as a fallback until the fetch resolves.
  const [amounts, setAmounts] = useState<Breakdown>({
    depositCents,
    subtotalCents: depositCents,
    taxCents: 0,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/party/${token}/create-intent`, { method: 'POST' })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not start the deposit.')
        setClientSecret(data.clientSecret)
        if (typeof data.depositCents === 'number') {
          setAmounts({
            depositCents: data.depositCents,
            subtotalCents: data.subtotalCents ?? data.depositCents,
            taxCents: data.taxCents ?? 0,
          })
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not start the deposit.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  if (loadError) {
    return (
      <div className="bg-apex-red/10 border border-apex-red/30 p-4">
        <p className="telemetry-text text-sm text-apex-red">{loadError}</p>
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="bg-asphalt-dark border border-white/10 p-8 text-center">
        <span className="animate-spin inline-block w-6 h-6 border-2 border-telemetry-cyan border-t-transparent rounded-full" />
        <p className="telemetry-text text-sm text-pit-gray mt-3">Setting up secure payment…</p>
      </div>
    )
  }

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
      <DepositForm token={token} amounts={amounts} />
    </Elements>
  )
}

function DepositForm({ token, amounts }: { token: string; amounts: Breakdown }) {
  const { depositCents, subtotalCents, taxCents } = amounts
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)

    const returnUrl = new URL(`/party/${token}`, window.location.origin).toString()
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Something went wrong with your payment. Please try again.')
      setSubmitting(false)
      return
    }
    // No-redirect path (no 3DS): we have the result synchronously.
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      setPaid(true)
      setSubmitting(false)
      return
    }
    // Otherwise Stripe handled a redirect; the return page shows the paid state.
  }

  if (paid) {
    return (
      <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-6 text-center">
        <h2 className="racing-headline text-2xl text-grid-white mb-2">
          Deposit <span className="text-telemetry-cyan">Received</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          Your event is confirmed — we&apos;ll be in touch to finalize the details. 🏁
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-asphalt-dark border border-white/10 p-6">
        {taxCents > 0 && (
          <div className="space-y-1.5 mb-4 pb-4 border-b border-white/10">
            <div className="flex items-baseline justify-between">
              <span className="telemetry-text text-xs text-pit-gray">Deposit (50% of event)</span>
              <span className="telemetry-text text-sm text-grid-white">{formatDollars(subtotalCents)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="telemetry-text text-xs text-pit-gray">Sales tax (7%)</span>
              <span className="telemetry-text text-sm text-grid-white">{formatDollars(taxCents)}</span>
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between mb-5">
          <span className="telemetry-text text-sm text-pit-gray uppercase tracking-wider">Deposit due</span>
          <span className="racing-headline text-3xl text-telemetry-cyan">{formatDollars(depositCents)}</span>
        </div>
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
            Processing…
          </>
        ) : (
          `Pay ${formatDollars(depositCents)} Deposit`
        )}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Powered by Stripe. We never see or store your card details.
      </p>
    </form>
  )
}
