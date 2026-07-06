'use client'

// Card collection UI using Stripe Elements.
//
// Mounts <PaymentElement /> with the SetupIntent client_secret returned from
// /api/booking/create. The card never touches our server — Elements posts
// directly to Stripe via its iframe.
//
// On submit:
//   1. stripe.confirmSetup() — saves the card to the customer + fires the
//      setup_intent.succeeded webhook server-side (which sets
//      bookings.stripe_payment_method_id).
//   2. We redirect to the booking confirmation page.

import { useState } from 'react'
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useRouter } from 'next/navigation'
import { metaTrack } from '@/components/MetaPixel'

interface CardSetupFormProps {
  bookingId: string
  sessionPriceCents: number
  noShowFeeCents: number
  customerFirstName: string
  customerEmail: string
}

export default function CardSetupForm({
  bookingId,
  sessionPriceCents,
  noShowFeeCents,
  customerFirstName,
  customerEmail,
}: CardSetupFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!stripe || !elements) {
      // Stripe.js hasn't loaded yet — button should be disabled, this is a guard.
      return
    }

    setSubmitting(true)

    // Build the redirect URL ahead of time so we don't need to recompute it
    // in the success path.
    const redirectUrl = new URL('/book/confirmation', window.location.origin)
    redirectUrl.searchParams.set('bookingId', bookingId)
    redirectUrl.searchParams.set('name', customerFirstName)

    const { error: stripeError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: redirectUrl.toString(),
      },
      // For most card flows Stripe redirects automatically, but for cards
      // that don't need 3DS we get a synchronous result — handle both.
      redirect: 'if_required',
    })

    if (stripeError) {
      setError(
        stripeError.message ??
          'Something went wrong saving your card. Please try again.'
      )
      setSubmitting(false)
      return
    }

    // Meta Pixel — card saved successfully = AddPaymentInfo. Only reachable on
    // the no-redirect (non-3DS) path; 3DS cards leave the page before we can
    // fire, which is acceptable undercounting for a funnel-health signal.
    metaTrack(
      'AddPaymentInfo',
      { value: sessionPriceCents / 100, currency: 'USD', content_category: 'booking' },
      `api_${bookingId}`
    )

    // No-redirect path (card didn't require 3DS): navigate ourselves.
    router.push(redirectUrl.toString())
  }

  const sessionDollars = (sessionPriceCents / 100).toFixed(0)
  const noShowDollars = (noShowFeeCents / 100).toFixed(0)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-asphalt-dark border border-white/10 p-6">
        <h3 className="racing-headline text-xl text-grid-white mb-2">
          Save Your <span className="text-telemetry-cyan">Card</span>
        </h3>
        <p className="telemetry-text text-sm text-pit-gray mb-6">
          Your card is held securely by Stripe.{' '}
          <span className="text-grid-white">It will not be charged today.</span>{' '}
          The ${noShowDollars} no-show fee is only charged if you don&apos;t show up
          for your session.
        </p>

        <PaymentElement
          options={{
            layout: 'tabs',
            defaultValues: { billingDetails: { email: customerEmail } },
          }}
        />
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red p-4">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-4 space-y-2">
        <div className="flex justify-between text-sm telemetry-text">
          <span className="text-pit-gray">Session price (paid in person)</span>
          <span className="text-grid-white">${sessionDollars}</span>
        </div>
        <div className="flex justify-between text-sm telemetry-text">
          <span className="text-pit-gray">Charged to card today</span>
          <span className="text-grid-white">$0.00</span>
        </div>
        <div className="flex justify-between text-sm telemetry-text border-t border-white/10 pt-2">
          <span className="text-pit-gray">Charged if you no-show</span>
          <span className="text-apex-red">${noShowDollars}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-xl hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Saving Card...
          </>
        ) : (
          `Save Card & Confirm Booking`
        )}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Powered by Stripe. We never see or store your card details.
      </p>
    </form>
  )
}
