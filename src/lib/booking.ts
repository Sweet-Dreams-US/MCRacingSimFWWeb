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
import {
  validateDiscount,
  recordRedemption,
  createFirstTimerReferralCode,
  DiscountError,
} from './discounts'
import { sendBookingEmails } from './emails/send-booking-emails'
import { sendEmail, getOwnerNotificationEmail } from './email'
import {
  inviteBookingEmail,
  ownerNewBookingEmail,
  sessionThankYouEmail,
  firstTimerThankYouEmail,
} from './emails/templates'

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

  // Optional discount code the customer entered at checkout. Re-validated
  // server-side here (source of truth) before it's stored on the booking.
  discountCode?: string | null
}

export interface CreateBookingResult {
  bookingId: string
  customerId: string
  stripeCustomerId: string
  setupIntentClientSecret: string
  noShowFeeCents: number
  sessionPriceCents: number
  // What the customer will actually owe at the venue after any discount.
  discountAmountCents: number
  amountDueCents: number
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
  // Exact lowercased match — NOT ilike. An email local-part can contain `_` or
  // `%`, which ilike would treat as LIKE wildcards and match the wrong customer.
  const { data: existingCustomer, error: lookupError } = await supabase
    .from('customers')
    .select('id, stripe_customer_id, first_name, last_name')
    .eq('email', emailLower)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Customer lookup failed: ${lookupError.message}`)
  }

  let customerId: string
  let stripeCustomerId: string | null = (existingCustomer as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null

  // The booker accepts the liability waiver during booking, so we stamp their
  // waiver here — a returning customer who booked online doesn't have to
  // re-sign at the front desk. (Additional racers still sign at check-in.)
  const nowIso = new Date().toISOString()

  if (existingCustomer) {
    customerId = (existingCustomer as { id: string }).id
    // Refresh their waiver timestamp on this booking.
    await supabase
      .from('customers')
      .update({ waiver_signed_at: nowIso, marketing_opt_in: input.marketingOptIn })
      .eq('id', customerId)
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
        waiver_signed_at: nowIso,
        source: 'booking',
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

  // 2b. Re-validate the discount code server-side (source of truth). The client
  // already priced it live, but a code can expire or hit its cap between then
  // and now — and the browser-supplied amount can never be trusted. If a code
  // was entered but is no longer valid, we fail loudly rather than silently
  // charging full price at the venue (which the customer wouldn't expect).
  let discountCode: string | null = null
  let discountAmountCents = 0
  if (input.discountCode && input.discountCode.trim()) {
    const result = await validateDiscount(supabase, input.discountCode, {
      priceCents: sessionPriceCents,
      hours: input.durationHours,
      appliesTo: 'session',
      customerId,
    })
    if (!result.ok) {
      throw new DiscountError(result.reason ?? 'That discount code is not valid.')
    }
    discountCode = result.code ?? null
    discountAmountCents = result.discountCents
  }
  const amountDueCents = Math.max(0, sessionPriceCents - discountAmountCents)

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
    discount_code: discountCode,
    discount_amount_cents: discountAmountCents,
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

  // 4. Insert one row per racer (slot 1 = primary, slots 2+ = friends).
  // Slot 1 (the booker) signed the waiver during booking → stamp it. Friends
  // sign at check-in.
  const racerRows = [
    {
      booking_id: bookingId,
      slot: 1,
      name: `${input.customer.firstName} ${input.customer.lastName}`.trim(),
      email: emailLower,
      phone: input.customer.phone || null,
      waiver_signed_at: nowIso,
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
    discountAmountCents,
    amountDueCents,
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
       customer_id, discount_code, discount_amount_cents,
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
  // partially fails. The conditional update + returned row tells us whether THIS
  // call won the pending→confirmed race — only the winner records the discount
  // redemption, so a re-fired webhook can never double-count a code's usage.
  const { data: flipped } = await supabase
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select('id')
  const wonConfirmRace = Array.isArray(flipped) && flipped.length > 0

  // Record the discount redemption now that the booking is real (card on file).
  // Deferred to here (not createBooking) so an abandoned pending booking never
  // burns a one-time code.
  if (wonConfirmRace && booking.discount_code && (booking.discount_amount_cents ?? 0) > 0) {
    try {
      const { data: dc } = await supabase
        .from('discount_codes')
        .select('id')
        .eq('code_upper', booking.discount_code)
        .maybeSingle()
      if (dc) {
        await recordRedemption(supabase, dc.id, {
          bookingId: booking.id,
          customerId: booking.customer_id,
          amountOffCents: booking.discount_amount_cents ?? 0,
          hours: booking.duration_hours,
        })
      }
    } catch (err) {
      // Non-fatal: the discount is already stored on the booking, so the POS
      // still charges the right amount. Only the usage counters would be off.
      console.error(`Discount redemption record failed for ${bookingId}:`, err)
    }
  }

  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer

  // Calendar event (only if not already created)
  if (customer && !booking.google_calendar_event_id) {
    try {
      const eventId = await createBookingCalendarEvent({
        bookingId,
        customerName: `${customer.first_name} ${customer.last_name}`.trim(),
        customerEmail: customer.email ?? '',
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

// ---------------------------------------------------------------------------
// Session completion side-effects: thank-you email + first-timer referral code.
// ---------------------------------------------------------------------------

const THANKYOU_TEMPLATES = ['session_thankyou', 'session_thankyou_firsttimer']

/**
 * Fire the post-session side effects when a booking is marked completed:
 *   - Returning racer  → a plain thank-you email.
 *   - First completion → a thank-you email carrying their personal
 *     "First-Time Racer 50% off" referral code (created here).
 *
 * Safe to call from any completion path (reader close-out, admin no-show flow
 * where everyone showed). Idempotent + never throws: it no-ops if a thank-you
 * was already logged for this booking, and only ever mints one referral per
 * customer (enforced in createFirstTimerReferralCode).
 */
export async function onBookingCompleted(bookingId: string): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, status, customer_id, customer:customers(id, first_name, email)')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking) return

    const customer = Array.isArray(booking.customer)
      ? booking.customer[0]
      : booking.customer
    if (!customer || !customer.email) return // can't thank someone with no email

    // Idempotency: if we've already logged a thank-you for this booking, stop —
    // staff re-tapping "close out" shouldn't send duplicates or re-mint codes.
    const { data: priorLog } = await supabase
      .from('email_log')
      .select('id')
      .eq('related_booking_id', bookingId)
      .in('template', THANKYOU_TEMPLATES)
      .limit(1)
    if (priorLog && priorLog.length > 0) return

    // First-timer = this is their only completed/partially-completed session.
    // (This runs after the status flip, so the current booking is counted.)
    const { count: completedCount } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'partial_noshow'])
    const isFirstTimer = (completedCount ?? 0) <= 1

    if (isFirstTimer) {
      const referral = await createFirstTimerReferralCode(supabase, {
        ownerCustomerId: customer.id,
        ownerFirstName: customer.first_name,
      })
      if (referral) {
        const { subject, html } = firstTimerThankYouEmail({
          customerFirstName: customer.first_name,
          referralCode: referral.code,
        })
        await sendEmail({
          to: customer.email,
          subject,
          html,
          template: 'session_thankyou_firsttimer',
          relatedBookingId: bookingId,
          relatedCustomerId: customer.id,
        })
        return
      }
      // Referral creation failed — fall through to a plain thank-you so the
      // customer still hears from us (better than silence).
    }

    const { subject, html } = sessionThankYouEmail({
      customerFirstName: customer.first_name,
    })
    await sendEmail({
      to: customer.email,
      subject,
      html,
      template: 'session_thankyou',
      relatedBookingId: bookingId,
      relatedCustomerId: customer.id,
    })
  } catch (err) {
    console.error(`onBookingCompleted failed for ${bookingId}:`, err)
  }
}

// ---------------------------------------------------------------------------
// Admin "invite to booking" — card-less booking created on the customer's
// behalf by an admin.
// ---------------------------------------------------------------------------

export interface InviteBookingInput {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  sessionDate: string // "YYYY-MM-DD"
  startTime: string // "HH:MM" 24-hour
  durationHours: 1 | 2 | 3
  racerCount: 1 | 2 | 3
  notes?: string
  createdByUserId?: string | null
}

export interface InviteBookingResult {
  bookingId: string
  customerId: string
}

/**
 * Create a confirmed booking on a customer's behalf WITHOUT collecting a card.
 *
 * Unlike createBooking() (which is hard-wired to a Stripe SetupIntent + the
 * pending→confirmed webhook flow), this inserts a 'confirmed' booking directly
 * and fires its side effects inline: a calendar event + an invite email to the
 * customer + an owner alert. No card means no no-show fee can apply, so
 * no_show_fee_cents / consent_fee_cents are 0 and the consent text is a sentinel.
 *
 * The booking becomes reminder-eligible automatically (status 'confirmed' with a
 * customer email) via the day-before reminder cron.
 */
export async function createInviteBooking(
  input: InviteBookingInput
): Promise<InviteBookingResult> {
  const supabase = createAdminClient()

  const emailLower = input.email.trim().toLowerCase()
  if (!emailLower.includes('@')) {
    throw new Error('A valid email address is required')
  }

  // Amounts (price is informational — collected in person, not now).
  const { price: sessionPriceDollars } = calculatePrice(
    input.sessionDate,
    input.durationHours,
    input.racerCount
  )
  const sessionPriceCents = sessionPriceDollars * 100
  const endTime = computeEndTime(input.startTime, input.durationHours)

  // 1. Find-or-create the customer by email (don't overwrite a returning
  //    customer's real name with a synthesized one).
  // Exact lowercased match — NOT ilike (see note in createBooking).
  const { data: existing, error: lookupError } = await supabase
    .from('customers')
    .select('id, first_name, last_name')
    .eq('email', emailLower)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Customer lookup failed: ${lookupError.message}`)
  }

  let customerId: string
  let firstName: string
  let lastName: string

  if (existing) {
    customerId = existing.id
    firstName = existing.first_name
    lastName = existing.last_name
  } else {
    const localPart = emailLower.split('@')[0] || 'racer'
    firstName =
      input.firstName?.trim() ||
      localPart.charAt(0).toUpperCase() + localPart.slice(1)
    lastName = input.lastName?.trim() || ''
    const { data: inserted, error: insertError } = await supabase
      .from('customers')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: emailLower,
        phone: input.phone?.trim() || null,
        marketing_opt_in: false,
        source: 'admin',
      })
      .select('id')
      .single()
    if (insertError || !inserted) {
      // A concurrent request may have created this email between our lookup and
      // this insert (unique LOWER(email) index, code 23505). Recover by reusing
      // the now-existing row instead of failing the booking.
      if (insertError?.code === '23505') {
        const { data: raced } = await supabase
          .from('customers')
          .select('id, first_name, last_name')
          .eq('email', emailLower)
          .maybeSingle()
        if (!raced) {
          throw new Error(`Customer insert failed: ${insertError.message}`)
        }
        customerId = raced.id
        firstName = raced.first_name
        lastName = raced.last_name
      } else {
        throw new Error(`Customer insert failed: ${insertError?.message ?? 'unknown'}`)
      }
    } else {
      customerId = inserted.id
    }
  }

  const fullName = `${firstName} ${lastName}`.trim() || emailLower

  // Idempotency: if an active booking already exists for this customer at the
  // exact same date + time (e.g. a double-clicked invite), reuse it instead of
  // creating a duplicate booking + re-sending emails.
  const { data: dupRows } = await supabase
    .from('bookings')
    .select('id')
    .eq('customer_id', customerId)
    .eq('session_date', input.sessionDate)
    .eq('start_time', input.startTime)
    .neq('status', 'cancelled')
    .limit(1)
  if (dupRows && dupRows.length > 0) {
    return { bookingId: dupRows[0].id, customerId }
  }

  // 2. Insert the confirmed, card-less booking.
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
    // No card on file → no no-show fee can be charged.
    no_show_fee_cents: 0,
    status: 'confirmed',
    source: 'admin',
    consent_text:
      'Admin-invited booking — no card on file; no no-show fee applies.',
    consent_fee_cents: 0,
    created_by_user_id: input.createdByUserId ?? null,
    notes: input.notes?.trim() || null,
  })

  if (bookingError) {
    throw new Error(`Booking insert failed: ${bookingError.message}`)
  }

  // 3. Slot-1 racer.
  const { error: racersError } = await supabase.from('booking_racers').insert({
    booking_id: bookingId,
    slot: 1,
    name: fullName,
    email: emailLower,
    phone: input.phone?.trim() || null,
  })
  if (racersError) {
    await supabase.from('bookings').delete().eq('id', bookingId)
    throw new Error(`Racer insert failed: ${racersError.message}`)
  }

  // 4. Calendar event (graceful no-op if creds missing).
  try {
    const eventId = await createBookingCalendarEvent({
      bookingId,
      customerName: fullName,
      customerEmail: emailLower,
      customerPhone: input.phone?.trim() || null,
      sessionDate: input.sessionDate,
      startTime: input.startTime,
      durationHours: input.durationHours,
      racerCount: input.racerCount,
      sessionPriceCents,
      noShowFeeCents: 0,
      source: 'admin',
    })
    if (eventId) {
      await supabase
        .from('bookings')
        .update({ google_calendar_event_id: eventId })
        .eq('id', bookingId)
    }
  } catch (err) {
    console.error(`Invite calendar event failed for ${bookingId}:`, err)
  }

  // 5. Emails — invite to the customer + owner alert. Best-effort (never throws).
  const invite = inviteBookingEmail({
    customerFirstName: firstName || 'racer',
    bookingId,
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    durationHours: input.durationHours,
    racerCount: input.racerCount,
    sessionPriceCents,
  })
  await sendEmail({
    to: emailLower,
    subject: invite.subject,
    html: invite.html,
    template: 'invite_booking',
    relatedBookingId: bookingId,
    relatedCustomerId: customerId,
  })

  const owner = ownerNewBookingEmail({
    bookingId,
    customerName: fullName,
    customerEmail: emailLower,
    customerPhone: input.phone?.trim() || '',
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    durationHours: input.durationHours,
    racerCount: input.racerCount,
    sessionPriceCents,
    source: 'admin',
  })
  await sendEmail({
    to: getOwnerNotificationEmail(),
    subject: owner.subject,
    html: owner.html,
    template: 'owner_new_booking',
    relatedBookingId: bookingId,
    relatedCustomerId: customerId,
  })

  return { bookingId, customerId }
}
