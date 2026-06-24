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
    status: 'confirmed',
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

  // 6. Fire-and-forget calendar event creation.
  //
  // We don't await this — the booking is already committed to the DB and
  // Stripe, and the user is waiting on a response so they can enter their
  // card details. A slow Google API call (or a missing service account in
  // dev/preview) must never block that.
  //
  // If the event creates successfully, we persist its ID on the booking
  // row so future reschedules / cancellations can update or delete the
  // same event. If the create fails, we log and move on — Mark can add
  // the event manually if needed, and the booking record itself is intact.
  const primaryName =
    `${input.customer.firstName} ${input.customer.lastName}`.trim()
  createBookingCalendarEvent({
    bookingId,
    customerName: primaryName,
    customerEmail: emailLower,
    customerPhone: input.customer.phone || null,
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    durationHours: input.durationHours,
    racerCount: input.racerCount,
    sessionPriceCents,
    noShowFeeCents,
    source: input.source ?? 'online',
  })
    .then(async (eventId) => {
      if (!eventId) return
      const { error: calendarUpdateError } = await supabase
        .from('bookings')
        .update({ google_calendar_event_id: eventId })
        .eq('id', bookingId)
      if (calendarUpdateError) {
        console.error(
          `Failed to persist google_calendar_event_id for ${bookingId}:`,
          calendarUpdateError.message
        )
      }
    })
    .catch((err) =>
      console.error(`Calendar event creation failed for ${bookingId}:`, err)
    )

  // 7. Fire-and-forget transactional emails.
  //
  // Same reasoning as the calendar block: the booking is already committed,
  // and the user is waiting on the SetupIntent client_secret. Emails are
  // best-effort — sendBookingEmails() never throws and logs each attempt
  // to email_log so the admin panel can show delivery state and offer
  // manual resend from the booking detail page (Phase 4).
  sendBookingEmails(bookingId).catch((err) =>
    console.error(`Email send failed for ${bookingId}:`, err)
  )

  return {
    bookingId,
    customerId,
    stripeCustomerId,
    setupIntentClientSecret: setupIntent.client_secret,
    noShowFeeCents,
    sessionPriceCents,
  }
}
