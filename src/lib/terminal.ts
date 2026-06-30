// Stripe Terminal helpers — server-driven in-person payments on the S700 reader.
//
// Flow: create a card_present PaymentIntent (attached to a Stripe Customer so
// the in-person charge links to the same customer as their website bookings),
// then push it to the physical reader with process_payment_intent. The reader
// prompts the customer to tap/insert. We poll the PaymentIntent status; on
// success Stripe emails the receipt and our webhook records the transaction.
//
// Use ONLY in server code.
import Stripe from 'stripe'
import { getStripe } from './stripe'

export function getTerminalLocationId(): string | null {
  return process.env.STRIPE_TERMINAL_LOCATION_ID ?? null
}

/**
 * Find an online reader registered to our location. We don't hardcode a reader
 * ID — this returns whichever reader is online (handles reader replacement and
 * keeps env config to just the location). Prefers an 'online' reader.
 */
export async function getActiveReader(): Promise<Stripe.Terminal.Reader | null> {
  const locationId = getTerminalLocationId()
  if (!locationId) return null

  const stripe = getStripe()
  const readers = await stripe.terminal.readers.list({
    location: locationId,
    limit: 100,
  })
  if (readers.data.length === 0) return null

  // Prefer an online reader; fall back to the first registered one.
  return (
    readers.data.find((r) => r.status === 'online') ?? readers.data[0]
  )
}

/**
 * Push a PaymentIntent to the reader for the customer to tap/insert.
 * Returns the reader's action state.
 */
export async function processOnReader(
  readerId: string,
  paymentIntentId: string
): Promise<Stripe.Terminal.Reader> {
  const stripe = getStripe()
  return stripe.terminal.readers.processPaymentIntent(readerId, {
    payment_intent: paymentIntentId,
  })
}

/**
 * Cancel whatever the reader is currently doing (e.g. the manager hit cancel
 * before the customer tapped).
 */
export async function cancelReaderAction(
  readerId: string
): Promise<Stripe.Terminal.Reader> {
  const stripe = getStripe()
  return stripe.terminal.readers.cancelAction(readerId)
}
