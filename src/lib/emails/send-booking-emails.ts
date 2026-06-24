// Orchestrator: when a booking is created, fan out three categories of email:
//   1. Booking confirmation to the primary racer (always).
//   2. "FYI you're racing" to slot 2+ racers WHO provided an email (optional).
//   3. Internal new-booking alert to OWNER_NOTIFICATION_EMAIL (always).
//
// This module is intentionally tolerant of partial failures: each email is
// sent independently and we collect a summary, never throw. The caller in
// src/lib/booking.ts fires this off without awaiting so a Resend outage
// can't slow down the booking response.

import { createAdminClient } from '../supabase/admin'
import { sendEmail, getOwnerNotificationEmail } from '../email'
import {
  bookingConfirmationEmail,
  friendFyiEmail,
  ownerNewBookingEmail,
} from './templates'

export interface SendBookingEmailsResult {
  sent: number
  skipped: number
  failed: number
}

/**
 * Fetch a booking + its customer + its racers, then send all booking emails.
 *
 * Returns a summary so callers/tests can see what happened. Doesn't throw on
 * individual email failures &mdash; those are recorded in email_log.
 *
 * Throws ONLY if the booking can't be loaded at all (missing booking/customer)
 * &mdash; that's a programming error worth surfacing.
 */
export async function sendBookingEmails(
  bookingId: string
): Promise<SendBookingEmailsResult> {
  const supabase = createAdminClient()
  const summary: SendBookingEmailsResult = { sent: 0, skipped: 0, failed: 0 }

  // ---- 1. Load the booking row ---------------------------------------------
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, session_date, start_time, duration_hours, racer_count, session_price_cents, no_show_fee_cents, source'
    )
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    throw new Error(
      `sendBookingEmails: booking ${bookingId} not found: ${bookingError?.message ?? 'no row'}`
    )
  }

  // ---- 2. Load the customer ------------------------------------------------
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .eq('id', booking.customer_id)
    .single()

  if (customerError || !customer) {
    throw new Error(
      `sendBookingEmails: customer ${booking.customer_id} for booking ${bookingId} not found: ${customerError?.message ?? 'no row'}`
    )
  }

  // ---- 3. Load racers (slot 2+) -------------------------------------------
  // Slot 1 is always the primary customer; we get their email from the
  // customers row above. Friends are slots 2 and 3.
  const { data: racers, error: racersError } = await supabase
    .from('booking_racers')
    .select('id, slot, name, email')
    .eq('booking_id', bookingId)
    .gt('slot', 1)
    .order('slot', { ascending: true })

  if (racersError) {
    // Non-fatal &mdash; we still send the primary confirmation + owner alert.
    console.error(
      `[email] Failed to load racers for booking ${bookingId}: ${racersError.message}`
    )
  }

  const friendRacers = racers ?? []

  // ---- 4. Send: booking confirmation to primary customer ------------------
  const confirmation = bookingConfirmationEmail({
    customerFirstName: customer.first_name,
    bookingId: booking.id,
    sessionDate: booking.session_date,
    startTime: booking.start_time,
    durationHours: booking.duration_hours,
    racerCount: booking.racer_count,
    sessionPriceCents: booking.session_price_cents,
    noShowFeeCents: booking.no_show_fee_cents,
  })

  await tally(
    summary,
    sendEmail({
      to: customer.email,
      subject: confirmation.subject,
      html: confirmation.html,
      template: 'booking_confirmation',
      relatedBookingId: booking.id,
      relatedCustomerId: customer.id,
    })
  )

  // ---- 5. Send: friend FYIs (slot 2+ with email) --------------------------
  const bookerFullName = `${customer.first_name} ${customer.last_name}`.trim()
  for (const racer of friendRacers) {
    if (!racer.email) continue // booker may not have provided friend email

    const friend = friendFyiEmail({
      friendName: racer.name,
      bookerName: bookerFullName,
      sessionDate: booking.session_date,
      startTime: booking.start_time,
      racerCount: booking.racer_count,
    })

    const messageId = await sendEmail({
      to: racer.email,
      subject: friend.subject,
      html: friend.html,
      template: 'friend_fyi',
      relatedBookingId: booking.id,
      relatedCustomerId: customer.id,
    })

    if (messageId !== null) {
      // Stamp the racer row so we can show "FYI sent" in the admin panel.
      // Only on success &mdash; skipped/failed sends stay retryable.
      const { error: stampError } = await supabase
        .from('booking_racers')
        .update({ friend_email_sent_at: new Date().toISOString() })
        .eq('id', racer.id)
      if (stampError) {
        console.error(
          `[email] Failed to stamp friend_email_sent_at on racer ${racer.id}: ${stampError.message}`
        )
      }
      summary.sent++
    } else if (process.env.RESEND_API_KEY) {
      summary.failed++
    } else {
      summary.skipped++
    }
  }

  // ---- 6. Send: internal owner alert --------------------------------------
  const owner = ownerNewBookingEmail({
    bookingId: booking.id,
    customerName: bookerFullName,
    customerEmail: customer.email,
    customerPhone: customer.phone ?? '',
    sessionDate: booking.session_date,
    startTime: booking.start_time,
    durationHours: booking.duration_hours,
    racerCount: booking.racer_count,
    sessionPriceCents: booking.session_price_cents,
    source: booking.source,
  })

  await tally(
    summary,
    sendEmail({
      to: getOwnerNotificationEmail(),
      subject: owner.subject,
      html: owner.html,
      template: 'owner_new_booking',
      relatedBookingId: booking.id,
      relatedCustomerId: customer.id,
    })
  )

  return summary
}

/**
 * Tally a single sendEmail() result into the summary. Treats `null` as
 * "skipped" when Resend is unconfigured, "failed" otherwise &mdash; matches
 * the distinction made in email_log.status.
 */
async function tally(
  summary: SendBookingEmailsResult,
  promise: Promise<string | null>
): Promise<void> {
  const messageId = await promise
  if (messageId !== null) {
    summary.sent++
  } else if (process.env.RESEND_API_KEY) {
    summary.failed++
  } else {
    summary.skipped++
  }
}
