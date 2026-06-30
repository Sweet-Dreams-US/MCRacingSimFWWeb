// Server-side booking creation pipeline.
//
// This is the core money-touching code path: find-or-create the customer +
// Stripe Customer, create a SetupIntent so we can save a card off-session,
// insert the booking with its consent snapshot, and insert one row per racer.
//
// Returns the client_secret of the SetupIntent so the browser can mount
// Stripe Elements to collect the card. The card itself is never seen by
// our server — it goes browser → Stripe directly.
//
// IDEMPOTENCY: callers should pass a unique idempotency_key when retrying.
// Stripe's idempotency layer ensures we don't create duplicate SetupIntents.

import { createAdminClient } from './supabase/admin'
import { getStripe } from './stripe'
import {
  calculatePrice,
  calculateNoShowFeeCents,
} from './pricing'
import { createBookingCalendarEvent } from './calendar'
import { sendBookingEmails } from './emails/send-booking-emails'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  // Session details
  sessionDate: string // "YYYY-MM-DD"
  startTime: string // "HH:MM" 24-hour
  durationHours: 1 | 2 | 3
  racerCount: 1 | 2 | 3

  // Primary racer / customer
  customer: {
    firstName: string
    lastName: string
    email: string
    phone: string
    birthday: string // "YYYY-MM-DD"
    howHeard: string
  }
  marketingOptIn: boolean

  // Additional racers (slots 2, 3) — phone/email optional per spec
  additionalRacers: Array<{
    name: string
    email?: string
    phone?: string
  }>

  // No-show consent snapshot — exactly what the user agreed to.
  // Stored on the booking row for chargeback defense.
  consentText: string
  consentTimestamp: string // ISO 8601
  consentIp?: string | null
  consentUserAgent?: string | null

  // Where this booking came from
  source?: 'online' | 'admin' | 'imported'
}

export interface CreateBookingResult {
  bookingId: string
  customerId: string
  stripeCustomerId: string
  setupIntentClientSecret: string
  noShowFeeCents: number
  sessionPriceCents: number
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Generate a human-shareable MC-XXXXXXX booking ID.
 * Format: MC + 7 base36 chars (5 random + 2 derived from ms-since-epoch %1296).
 * Collision probability at our scale (hundreds of bookings per year): negligible.
 * The PRIMARY KEY constraint on bookings.id ensures any collision fails fast.
 */
function generateBookingId(): string {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase()
  const ts = (Date.now() % 1296).toString(36).toUpperCase().padStart(2, '0')
  return `MC-${random}${ts}`
}

/**
 * Add `durationHours` to a "HH:MM" 24-hour string. Wraps past midnight
 * (e.g. 23:00 + 3h = 02:00). End times never include a date because the
 * booking row already carries session_date.
 */
function computeEndTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const endHour = (h + durationHours) % 24
  return `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Create a booking with a card-on-file SetupIntent.
 *
 * The flow on the client side after this returns:
 *   1. Mount Stripe Elements with the returned client_secret.
 *   2. User enters card details directly into Stripe Elements iframe.
 *   3. Client calls stripe.confirmSetupIntent() — Stripe attaches the
 *      payment method to the customer and fires setup_intent.succeeded.
 *   4. Our webhook updates booking.stripe_payment_method_id with the
 *      saved card so we can charge it later on no-show.
 */
export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const supabase = createAdminClient()
  const stripe = getStripe()

  // 0. Validate + compute amounts
  const { price: sessionPriceDollars } = calculatePrice(
    input.sessionDate,
    input.durationHours,
    input.racerCount
  )
  const sessionPriceCents = sessionPriceDollars * 100
  const noShowFeeCents = calculateNoShowFeeCents(input.racerCount)
  const endTime = computeEndTime(input.startTime, input.durationHours)
  const emailLower = input.customer.email.trim().toLowerCase()

  // 1. Find or create the customer (case-insensitive email match)
  const { data: existingCustomer, error: lookupError } = await supabase
    .from('customers')
    .select('id, stripe_customer_id, first_name, last_name')
    .ilike('email', emailLower)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Customer lookup failed: ${lookupError.message}`)
  }

  let customerId: string
  let stripeCustomerId: string | null = (existingCustomer as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null

  if (existingCustomer) {
    customerId = (existingCustomer as { id: string }).id
  } else {
    // Insert a new customer row
    const { data: inserted, error: insertError } = await supabase
      .from('customers')
      .insert({
        first_name: input.customer.firstName,
        last_name: input.customer.lastName,
        email: emailLower,
        phone: input.customer.phone || null,
        birthday: input.customer.birthday || null,
        how_heard: input.customer.howHeard || null,
        marketing_opt_in: input.marketingOptIn,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      throw new Error(
        `Customer insert failed: ${insertError?.message ?? 'unknown error'}`
      )
    }
    customerId = (inserted as { id: string }).id
  }

  // 2. Ensure the customer has a Stripe Customer attached
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: emailLower,
      name: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
      phone: input.customer.phone || undefined,
      metadata: {
        supabase_customer_id: customerId,
      },
    })
    stripeCustomerId = stripeCustomer.id

    // Write the stripe_customer_id back so we re-use it on future bookings
    const { error: updateError } = await supabase
      .from('customers')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', customerId)

    if (updateError) {
      // Not fatal — we have a Stripe Customer either way. Log and continue.
      // The customer will get a fresh one on the next booking; no money lost.
      console.error(
        `Warning: failed to persist stripe_customer_id back to Supabase: ${updateError.message}`
      )
    }
  }

  // 3. Generate the booking ID and insert the booking row WITH the consent snapshot
  const bookingId = generateBookingId()

  const { error: bookingError } = await supabase.from('bookings').insert({
    id: bookingId,
    customer_id: customerId,
    session_date: input.sessionDate,
    start_time: input.startTime,
    end_time: endTime,
    duration_hours: input.durationHours,
    racer_count: input.racerCount,
    session_price_cents: sessionPriceCents,
    no_show_fee_cents: noShowFeeCents,
    // Starts 'pending' — the booking only becomes 'confirmed' once the card is
    // saved (the setup_intent.succeeded webhook). Confirmation emails + the
    // calendar event fire at THAT point, not here — otherwise the customer
    // would get a confirmation before they've actually submitted a card.
    status: 'pending',
    source: input.source ?? 'online',
    // Consent snapshot — exactly what the user agreed to + when + from where
    consent_text: input.consentText,
    consent_fee_cents: noShowFeeCents,
    consent_timestamp: input.consentTimestamp,
    consent_ip: input.consentIp ?? null,
    consent_user_agent: input.consentUserAgent ?? null,
  })

  if (bookingError) {
    throw new Error(`Booking insert failed: ${bookingError.message}`)
  }

  // 4. Insert one row per racer (slot 1 = primary, slots 2+ = friends)
  const racerRows = [
    {
      booking_id: bookingId,
      slot: 1,
      name: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
      email: emailLower,
      phone: input.customer.phone || null,
    },
    ...input.additionalRacers.slice(0, input.racerCount - 1).map((r, i) => ({
      booking_id: bookingId,
      slot: i + 2,
      name: r.name,
      email: r.email?.trim().toLowerCase() || null,
      phone: r.phone || null,
    })),
  ]

  const { error: racersError } = await supabase
    .from('booking_racers')
    .insert(racerRows)

  if (racersError) {
    // Rollback the booking row to keep DB consistent — we don't want orphan
    // bookings with no racers. This is best-effort; if it also fails the
    // admin will need to clean up manually (audit log shows what happened).
    await supabase.from('bookings').delete().eq('id', bookingId)
    throw new Error(`Racer insert failed: ${racersError.message}`)
  }

  // 5. Create the SetupIntent so the browser can save a card off-session
  const setupIntent = await stripe.setupIntents.create(
    {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        booking_id: bookingId,
        supabase_customer_id: customerId,
      },
    },
    {
      // Stripe idempotency — if the same booking retries, we get the same
      // SetupIntent back instead of creating duplicates.
      idempotencyKey: `setup-intent-${bookingId}`,
    }
  )

  // Persist the setup_intent_id on the booking so we can correlate the webhook
  await supabase
    .from('bookings')
    .update({ stripe_setup_intent_id: setupIntent.id })
    .eq('id', bookingId)

  if (!setupIntent.client_secret) {
    throw new Error('Stripe returned a SetupIntent without a client_secret')
  }

  // NOTE: No emails or calendar event here. The booking is still 'pending'
  // until the card is saved. Confirmation emails + the calendar event are
  // fired by finalizeConfirmedBooking(), called from the
  // setup_intent.succeeded webhook once the card is actually on file.

  return {
    bookingId,
    customerId,
    stripeCustomerId,
    setupIntentClientSecret: setupIntent.client_secret,
    noShowFeeCents,
    sessionPriceCents,
  }
}

/**
 * Promote a booking from 'pending' to 'confirmed' and fire the side effects
 * that should only happen once a card is genuinely on file: the Google
 * Calendar event + the confirmation/owner emails.
 *
 * Called from the setup_intent.succeeded webhook AFTER the payment method has
 * been attached. Idempotent: if the booking is already 'confirmed' (e.g. a
 * duplicate/re-fired SetupIntent), it no-ops so we never send duplicate
 * confirmations.
 *
 * Awaited by the webhook (not fire-and-forget) so the work completes before
 * the serverless function freezes.
 */
export async function finalizeConfirmedBooking(bookingId: string): Promise<void> {
  const supabase = createAdminClient()

  // Load the booking + its customer. Only finalize a still-pending booking.
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      `id, status, session_date, start_time, duration_hours, racer_count,
       session_price_cents, no_show_fee_cents, source, google_calendar_event_id,
       customer:customers(first_name, last_name, email, phone)`
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !booking) {
    console.error(`finalizeConfirmedBooking: booking ${bookingId} not found`)
    return
  }

  // Idempotency guard — only the first pending→confirmed transition fires
  // emails + calendar.
  if (booking.status !== 'pending') {
    return
  }

  // Flip to confirmed first so a retry can't double-fire even if the work below
  // partially fails.
  await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', bookingId)
    .eq('status', 'pending')

  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer

  // Calendar event (only if not already created)
  if (customer && !booking.google_calendar_event_id) {
    try {
      const eventId = await createBookingCalendarEvent({
        bookingId,
        customerName: `${customer.first_name} ${customer.last_name}`.trim(),
        customerEmail: customer.email,
        customerPhone: customer.phone,
        sessionDate: booking.session_date,
        startTime: booking.start_time,
        durationHours: booking.duration_hours as 1 | 2 | 3,
        racerCount: booking.racer_count as 1 | 2 | 3,
        sessionPriceCents: booking.session_price_cents,
        noShowFeeCents: booking.no_show_fee_cents,
        source: booking.source,
      })
      if (eventId) {
        await supabase
          .from('bookings')
          .update({ google_calendar_event_id: eventId })
          .eq('id', bookingId)
      }
    } catch (err) {
      console.error(`Calendar event creation failed for ${bookingId}:`, err)
    }
  }

  // Confirmation + owner + friend-FYI emails
  try {
    await sendBookingEmails(bookingId)
  } catch (err) {
    console.error(`Email send failed for ${bookingId}:`, err)
  }
}
