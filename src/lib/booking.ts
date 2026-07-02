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
import type { Database } from './supabase/types'
import { getStripe } from './stripe'
import {
  calculatePrice,
  calculateNoShowFeeCents,
  isMonday,
} from './pricing'
import { createBookingCalendarEvent, resyncBookingCalendarEvent } from './calendar'
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
 * Human-friendly confirmation code tied to the racer's name + session date:
 * "MC-JAKE0704" (first name + MMDD). Easy for a customer to recognize and read
 * back over the phone. `attempt` (0-based) appends a numeric suffix on the rare
 * collision (-2, -3, …); callers retry against the PRIMARY KEY constraint so
 * the id stays unique.
 */
function generateBookingId(firstName: string, sessionDate: string, attempt = 0): string {
  const name = (firstName || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'RACER'
  const [, mm = '', dd = ''] = sessionDate.split('-') // "YYYY-MM-DD"
  const mmdd = mm && dd ? `${mm}${dd}` : '0000'
  const base = `MC-${name}${mmdd}`
  return attempt === 0 ? base : `${base}-${attempt + 1}`
}

/**
 * Add `durationHours` to a "HH:MM" 24-hour string. Wraps past midnight
 * (e.g. 23:00 + 3h = 02:00). End times never include a date because the
 * booking row already carries session_date.
 */
export function computeEndTime(startTime: string, durationHours: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const endHour = (h + durationHours) % 24
  return `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Normalize a Postgres TIME ("HH:MM:SS") or form value to "HH:MM". */
function toHHMM(time: string): string {
  const [h = '00', m = '00'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** Format an integer-cents amount as "$X.XX" for admin-facing warnings. */
function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * True only if "YYYY-MM-DD" names a real calendar day. A shape-only regex
 * accepts "2026-13-45" or "2026-02-30", which JS's Date silently rolls over
 * (or turns into Invalid Date) — that would bypass the closed-Monday guard and
 * the price matrix. We reject anything that doesn't round-trip exactly.
 */
function isRealCalendarDate(ymd: string): boolean {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(`${ymd}T12:00:00`)
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() + 1 === m &&
    dt.getDate() === d
  )
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

  // 3. Insert the booking row WITH the consent snapshot, under a human-friendly
  // MC-<NAME><MMDD> id. On the rare collision (same first name + session date),
  // retry with a numeric suffix until the PRIMARY KEY accepts it.
  const bookingRow = {
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
    status: 'pending' as const,
    source: input.source ?? 'online',
    // Consent snapshot — exactly what the user agreed to + when + from where
    consent_text: input.consentText,
    consent_fee_cents: noShowFeeCents,
    consent_timestamp: input.consentTimestamp,
    consent_ip: input.consentIp ?? null,
    consent_user_agent: input.consentUserAgent ?? null,
  }

  let bookingId = ''
  let inserted = false
  for (let attempt = 0; attempt < 25 && !inserted; attempt++) {
    bookingId = generateBookingId(input.customer.firstName, input.sessionDate, attempt)
    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({ id: bookingId, ...bookingRow })
    if (!bookingError) {
      inserted = true
      break
    }
    // 23505 = unique_violation on the PK → try the next suffix; anything else is fatal.
    if (bookingError.code !== '23505') {
      throw new Error(`Booking insert failed: ${bookingError.message}`)
    }
  }
  if (!inserted) {
    throw new Error('Could not generate a unique booking ID — please try again.')
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

  // 2. Insert the confirmed, card-less booking under a human-friendly
  // MC-<NAME><MMDD> id, retrying with a numeric suffix on PK collision.
  const inviteRow = {
    customer_id: customerId,
    session_date: input.sessionDate,
    start_time: input.startTime,
    end_time: endTime,
    duration_hours: input.durationHours,
    racer_count: input.racerCount,
    session_price_cents: sessionPriceCents,
    // No card on file → no no-show fee can be charged.
    no_show_fee_cents: 0,
    status: 'confirmed' as const,
    source: 'admin' as const,
    consent_text:
      'Admin-invited booking — no card on file; no no-show fee applies.',
    consent_fee_cents: 0,
    created_by_user_id: input.createdByUserId ?? null,
    notes: input.notes?.trim() || null,
  }

  let bookingId = ''
  let inserted = false
  for (let attempt = 0; attempt < 25 && !inserted; attempt++) {
    bookingId = generateBookingId(firstName, input.sessionDate, attempt)
    const { error: bookingError } = await supabase
      .from('bookings')
      .insert({ id: bookingId, ...inviteRow })
    if (!bookingError) {
      inserted = true
      break
    }
    if (bookingError.code !== '23505') {
      throw new Error(`Booking insert failed: ${bookingError.message}`)
    }
  }
  if (!inserted) {
    throw new Error('Could not generate a unique booking ID — please try again.')
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

// ---------------------------------------------------------------------------
// Admin "edit booking details" — recompute money server-side, reconcile racer
// rows, keep the Google Calendar event + discount in sync.
// ---------------------------------------------------------------------------

/** Thrown for admin-fixable edit problems (bad input, status guard). Routes map it to 400. */
export class BookingEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookingEditError'
  }
}

export interface EditBookingInput {
  sessionDate?: string // "YYYY-MM-DD"
  startTime?: string // "HH:MM"
  durationHours?: 1 | 2 | 3
  racerCount?: 1 | 2 | 3
  // Manual override of the session price in cents. undefined = recompute from
  // the matrix; a number = use exactly this (POS-style override). Never trust
  // a client price except through this explicit field.
  priceOverrideCents?: number | null
  notes?: string | null
}

export interface EditBookingResult {
  bookingId: string
  sessionPriceCents: number
  discountAmountCents: number
  noShowFeeCents: number
  warnings: string[]
}

// Scheduling/price/racer edits are only safe while a booking is still open.
// Terminal states have settled money (no-show charges, POS payments, showed_up
// flags) that these edits would silently desync.
const EDITABLE_STATUSES = new Set(['pending', 'confirmed'])

/**
 * Edit an existing booking. Recomputes end_time, session price, no-show fee,
 * and any applied discount server-side; reconciles booking_racers rows when the
 * racer count changes; and re-syncs the Google Calendar event. Returns a list
 * of non-fatal warnings (over-collection, consent gap, discount no longer
 * covering the session) for the admin to see.
 *
 * Throws BookingEditError for admin-fixable problems (bad values, editing a
 * settled booking). Best-effort for side effects (calendar) — those never fail
 * the edit.
 */
export async function editBooking(
  bookingId: string,
  input: EditBookingInput,
  actor: { adminUserId: string }
): Promise<EditBookingResult> {
  const supabase = createAdminClient()
  const warnings: string[] = []

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      `id, status, source, session_date, start_time, duration_hours, racer_count,
       session_price_cents, price_overridden, no_show_fee_cents, discount_code, discount_amount_cents,
       consent_fee_cents, stripe_payment_method_id, google_calendar_event_id,
       customer:customers(first_name, last_name, email, phone)`
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (error) throw new Error(`Booking lookup failed: ${error.message}`)
  if (!booking) throw new BookingEditError('Booking not found.')

  // Resolve the new values (fall back to current). start_time from the DB is a
  // TIME "HH:MM:SS"; normalize everything to "HH:MM".
  const newDate = input.sessionDate ?? booking.session_date
  const newStart = toHHMM(input.startTime ?? booking.start_time)
  const newDuration = (input.durationHours ?? booking.duration_hours) as 1 | 2 | 3
  const newRacerCount = (input.racerCount ?? booking.racer_count) as 1 | 2 | 3

  // ---- Validate (reject bad input with a clean 400, never let it hit the DB) ---
  // Bound the shapes tightly: a loose regex would pass "29:00" / "2026-13-45"
  // straight to the TIME/DATE columns and surface as an opaque 500.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !isRealCalendarDate(newDate)) {
    throw new BookingEditError('Invalid session date.')
  }
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(newStart)) {
    throw new BookingEditError('Invalid start time.')
  }
  if (![1, 2, 3].includes(newDuration)) throw new BookingEditError('Duration must be 1, 2, or 3 hours.')
  if (![1, 2, 3].includes(newRacerCount)) throw new BookingEditError('Racers must be 1, 2, or 3.')
  if (isMonday(newDate)) throw new BookingEditError('The venue is closed Mondays — pick another day.')

  const schedulingChanged =
    newDate !== booking.session_date ||
    newStart !== toHHMM(booking.start_time) ||
    newDuration !== booking.duration_hours
  const racerChanged = newRacerCount !== booking.racer_count
  // A price change is *requested* whenever the caller sends the field at all
  // (a number sets an override, null clears it). Omitting it is not a change.
  const priceChangeRequested = input.priceOverrideCents !== undefined
  const structuralChange = schedulingChanged || racerChanged || priceChangeRequested

  // ---- Status guard: only open bookings can have money/schedule edited ----
  if (structuralChange && !EDITABLE_STATUSES.has(booking.status)) {
    throw new BookingEditError(
      `A ${booking.status} booking's date, time, racers, or price can't be changed — only its notes. Money and no-show status are already settled.`
    )
  }

  // ---- Recompute money server-side --------------------------------------
  // The auto (matrix) price for the resolved date/duration/racers.
  const autoPriceCents = calculatePrice(newDate, newDuration, newRacerCount).price * 100
  let newPriceCents: number
  let newOverridden: boolean
  if (input.priceOverrideCents === null) {
    // Explicitly clear any override → back to the matrix price.
    newPriceCents = autoPriceCents
    newOverridden = false
  } else if (input.priceOverrideCents !== undefined) {
    // Explicit manual override.
    const override = Math.round(input.priceOverrideCents)
    if (!Number.isFinite(override) || override < 0) {
      throw new BookingEditError('Override price must be $0 or more.')
    }
    newPriceCents = override
    newOverridden = true
  } else if (booking.price_overridden) {
    // Price field omitted AND this booking already carries a manual override —
    // preserve it (a notes-only or reschedule edit must not silently reset a
    // deliberately-set price back to the matrix).
    newPriceCents = booking.session_price_cents
    newOverridden = true
  } else {
    // Price field omitted, no prior override → track the matrix price.
    newPriceCents = autoPriceCents
    newOverridden = false
  }

  const newEndTime = computeEndTime(newStart, newDuration)
  const newNoShowFeeCents = calculateNoShowFeeCents(newRacerCount)

  // ---- Reconcile the applied discount against the new price/hours --------
  // We DON'T re-run full validateDiscount here (this booking already consumed
  // the code's redemption at confirm time, so cap checks would falsely fail).
  // We just re-derive the discount AMOUNT for the new price, and flag if the
  // code's terms no longer cover the edited session.
  let newDiscountCents = booking.discount_amount_cents ?? 0
  if (booking.discount_code && (structuralChange || newDiscountCents > 0)) {
    const { data: dc } = await supabase
      .from('discount_codes')
      .select('kind, percent_off, amount_off_cents, max_hours_per_booking')
      .eq('code_upper', booking.discount_code)
      .maybeSingle()
    if (dc) {
      if (dc.max_hours_per_booking != null && newDuration > dc.max_hours_per_booking) {
        newDiscountCents = 0
        warnings.push(
          `Discount ${booking.discount_code} only covers sessions up to ${dc.max_hours_per_booking}h; the new ${newDuration}h session isn't eligible, so the discount was removed.`
        )
      } else if (dc.kind === 'percent' && dc.percent_off) {
        newDiscountCents = Math.floor((newPriceCents * dc.percent_off) / 100)
      } else if (dc.kind === 'fixed' && dc.amount_off_cents) {
        newDiscountCents = dc.amount_off_cents
      }
    }
    newDiscountCents = Math.max(0, Math.min(newDiscountCents, newPriceCents))
  }

  // ---- Consent gap: raising racers expands no-show beyond what was agreed --
  if (
    newRacerCount > booking.racer_count &&
    booking.stripe_payment_method_id &&
    booking.consent_fee_cents != null &&
    newNoShowFeeCents > booking.consent_fee_cents
  ) {
    warnings.push(
      `Racer count went up: the customer only authorized a ${formatDollars(booking.consent_fee_cents)} no-show fee, so the extra seats aren't covered by the card on file.`
    )
  }

  // ---- Over-collection: lowering the total below what's already paid ------
  if (structuralChange) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('amount_cents, tip_cents')
      .eq('booking_id', bookingId)
      .is('soft_deleted_at', null)
    const paidCents = (txns ?? []).reduce(
      (sum, t) => sum + (t.amount_cents - (t.tip_cents ?? 0)),
      0
    )
    const newNetCents = Math.max(0, newPriceCents - newDiscountCents)
    if (paidCents > newNetCents) {
      warnings.push(
        `Already collected ${formatDollars(paidCents)} but the new total is ${formatDollars(newNetCents)} — you may owe the customer a ${formatDollars(paidCents - newNetCents)} refund.`
      )
    }
  }

  // ---- Reconcile booking_racers BEFORE committing racer_count -----------
  // Order matters: if this fails we throw before the bookings UPDATE, so
  // racer_count can never be committed out of sync with the actual rows.
  if (racerChanged) {
    if (newRacerCount < booking.racer_count) {
      // Never destroy a seat that carries evidence — check-in stamps a signed
      // waiver (waiver_signed_at / waiver_form_data) onto the slot row while the
      // booking is still 'confirmed'. Refuse rather than silently delete it.
      const { data: excess, error: exErr } = await supabase
        .from('booking_racers')
        .select('slot, waiver_signed_at, waiver_form_data, showed_up')
        .eq('booking_id', bookingId)
        .gt('slot', newRacerCount)
      if (exErr) throw new Error(`Racer lookup failed: ${exErr.message}`)
      const checkedIn = (excess ?? []).filter(
        (r) => r.waiver_signed_at != null || r.waiver_form_data != null || r.showed_up != null
      )
      if (checkedIn.length > 0) {
        const slots = checkedIn.map((r) => r.slot).join(', ')
        throw new BookingEditError(
          `Can't lower the racer count — seat ${slots} already has a checked-in racer / signed waiver. Handle that seat before shrinking the booking.`
        )
      }
      const { error: delErr } = await supabase
        .from('booking_racers')
        .delete()
        .eq('booking_id', bookingId)
        .gt('slot', newRacerCount)
      if (delErr) throw new Error(`Removing racer rows failed: ${delErr.message}`)
    } else {
      // Add placeholder rows for the new seats. Real names/waivers are captured
      // at check-in. Only insert slots that don't already exist (avoids the
      // UNIQUE(booking_id, slot) violation if a gap was left by a prior edit).
      const { data: existing, error: exErr } = await supabase
        .from('booking_racers')
        .select('slot')
        .eq('booking_id', bookingId)
      if (exErr) throw new Error(`Racer lookup failed: ${exErr.message}`)
      const have = new Set((existing ?? []).map((r) => r.slot))
      const rows = []
      for (let slot = 2; slot <= newRacerCount; slot++) {
        if (!have.has(slot)) rows.push({ booking_id: bookingId, slot, name: `Racer ${slot}` })
      }
      if (rows.length > 0) {
        const { error: racerErr } = await supabase.from('booking_racers').insert(rows)
        if (racerErr) throw new Error(`Adding racer rows failed: ${racerErr.message}`)
      }
    }
  }

  // ---- Persist the booking row ------------------------------------------
  const patch: Database['public']['Tables']['bookings']['Update'] = {
    session_date: newDate,
    start_time: newStart,
    end_time: newEndTime,
    duration_hours: newDuration,
    racer_count: newRacerCount,
    session_price_cents: newPriceCents,
    price_overridden: newOverridden,
    no_show_fee_cents: newNoShowFeeCents,
    discount_amount_cents: newDiscountCents,
    updated_by_user_id: actor.adminUserId,
  }
  if (input.notes !== undefined) patch.notes = input.notes
  // If the date moved, let the day-before reminder cron fire again.
  if (newDate !== booking.session_date) patch.reminder_email_sent_at = null

  const { error: updateError } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', bookingId)
  if (updateError) throw new Error(`Booking update failed: ${updateError.message}`)

  // ---- Re-sync the Google Calendar event (best-effort) ------------------
  if (booking.google_calendar_event_id) {
    const c = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
    try {
      await resyncBookingCalendarEvent(booking.google_calendar_event_id, {
        bookingId,
        customerName: c ? `${c.first_name} ${c.last_name}`.trim() : bookingId,
        customerEmail: c?.email ?? '',
        customerPhone: c?.phone ?? null,
        sessionDate: newDate,
        startTime: newStart,
        durationHours: newDuration,
        racerCount: newRacerCount,
        sessionPriceCents: newPriceCents,
        noShowFeeCents: newNoShowFeeCents,
        source: booking.source,
      })
    } catch (err) {
      console.error(`editBooking: calendar re-sync failed for ${bookingId}:`, err)
      warnings.push('Booking saved, but the Google Calendar event could not be updated.')
    }
  }

  return {
    bookingId,
    sessionPriceCents: newPriceCents,
    discountAmountCents: newDiscountCents,
    noShowFeeCents: newNoShowFeeCents,
    warnings,
  }
}
