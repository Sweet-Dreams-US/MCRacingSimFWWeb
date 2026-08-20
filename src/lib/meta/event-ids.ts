// src/lib/meta/event-ids.ts
// The single source of truth for Meta `event_id` values.
//
// Every conversion in the booking funnel is fired TWICE on purpose — once from
// the browser Pixel and once from our server via the Conversions API — so that
// a blocked Pixel doesn't lose the conversion and a lost webhook doesn't
// either. Meta collapses the pair into ONE conversion if, and only if, both
// carry the same (event_name, event_id).
//
// The two halves live far apart: the browser Schedule fires in a React
// component on /book/confirmation, the server Schedule fires in a Stripe
// webhook handler minutes later. When each side built its own id string, they
// matched only by convention — and a one-character drift would silently double
// every booking in Ads Manager, inflating reported conversions and teaching the
// optimizer the wrong thing. That failure is invisible in our own reconciliation
// (our side looks perfectly healthy) which makes it especially nasty.
//
// So both sides call these functions. Parity is now structural: you cannot
// change one half without changing the other.
//
// These are pure string builders with no imports, safe in client and server
// code alike. Ids must be DETERMINISTIC — derived from a stable business key,
// never from Date.now() or a random UUID — so that a retry, a refresh, or a
// redelivered webhook reproduces the same id instead of minting a new
// conversion.
//
// Server-only events (POS Purchase, check-in CompleteRegistration, party
// Purchase) have no browser counterpart and keep their ids at the call site.

/** Booking confirmed — THE conversion. Browser: /book/confirmation. Server: finalizeConfirmedBooking(). */
export function scheduleEventId(bookingId: string): string {
  return `sched_${bookingId}`
}

/** Details submitted, card step reached. Browser: BookingFlow. Server: /api/booking/create. */
export function initiateCheckoutEventId(bookingId: string): string {
  return `ic_${bookingId}`
}

/** Card accepted by Stripe. Browser: CardSetupForm (non-3DS only). Server: finalizeConfirmedBooking(). */
export function addPaymentInfoEventId(bookingId: string): string {
  return `api_${bookingId}`
}
