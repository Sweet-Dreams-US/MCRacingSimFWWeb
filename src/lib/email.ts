// Resend transactional-email client + sendEmail() helper.
//
// Design notes:
//   - LAZY SINGLETON: we only instantiate the Resend SDK on first use so
//     module import doesn't crash dev/preview environments that haven't yet
//     populated RESEND_API_KEY.
//   - GRACEFUL DEGRADATION: when RESEND_API_KEY is missing, sendEmail() logs
//     a row to email_log with status='skipped' and returns null. This lets
//     the booking pipeline keep running in dev/preview without throwing.
//   - ALWAYS LOG: every send attempt — successful, skipped, or failed —
//     writes a row to email_log so the admin panel can show delivery status.
//   - NEVER THROW from sendEmail(). Callers (the booking pipeline) treat
//     emails as best-effort; we don't want a Resend outage to block a booking.

import { Resend } from 'resend'
import { createAdminClient } from './supabase/admin'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_FROM_EMAIL = 'MC Racing Sim <bookings@mcracingsimfortwayne.com>'
const DEFAULT_OWNER_EMAIL = 'mcracingfortwayne@gmail.com'

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL
}

export function getOwnerNotificationEmail(): string {
  return process.env.OWNER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL
}

// ---------------------------------------------------------------------------
// Lazy Resend client
// ---------------------------------------------------------------------------

let cachedResend: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!cachedResend) {
    cachedResend = new Resend(apiKey)
  }
  return cachedResend
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  /** Short identifier for this email template (e.g. 'booking_confirmation'). */
  template: string
  relatedBookingId?: string | null
  relatedCustomerId?: string | null
}

/**
 * Send a transactional email through Resend.
 *
 * Always writes a row to `email_log`. Returns:
 *   - the Resend message id on success
 *   - null on skip (Resend not configured) or failure
 *
 * Never throws — callers should treat emails as fire-and-forget.
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<string | null> {
  const { to, subject, html, template, relatedBookingId, relatedCustomerId } =
    params

  const fromEmail = getFromEmail()
  const supabase = createAdminClient()
  const resend = getResend()

  // --- Skip path: Resend not configured ----------------------------------
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping ${template} → ${to}`
    )
    const { error: logError } = await supabase.from('email_log').insert({
      from_email: fromEmail,
      to_email: to,
      subject,
      template,
      status: 'skipped',
      error: 'Resend not configured',
      related_booking_id: relatedBookingId ?? null,
      related_customer_id: relatedCustomerId ?? null,
    })
    if (logError) {
      console.error(`[email] Failed to log skipped email: ${logError.message}`)
    }
    return null
  }

  // --- Send path ---------------------------------------------------------
  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })

    if (result.error) {
      const errMsg = `${result.error.name}: ${result.error.message}`
      console.error(`[email] Resend rejected ${template} → ${to}: ${errMsg}`)
      const { error: logError } = await supabase.from('email_log').insert({
        from_email: fromEmail,
        to_email: to,
        subject,
        template,
        status: 'failed',
        error: errMsg,
        related_booking_id: relatedBookingId ?? null,
        related_customer_id: relatedCustomerId ?? null,
      })
      if (logError) {
        console.error(
          `[email] Failed to log failed email: ${logError.message}`
        )
      }
      return null
    }

    const messageId = result.data?.id ?? null

    const { error: logError } = await supabase.from('email_log').insert({
      from_email: fromEmail,
      to_email: to,
      subject,
      template,
      status: 'sent',
      resend_message_id: messageId,
      related_booking_id: relatedBookingId ?? null,
      related_customer_id: relatedCustomerId ?? null,
    })
    if (logError) {
      // Don't fail the call — Resend already accepted the message.
      console.error(`[email] Failed to log sent email: ${logError.message}`)
    }

    return messageId
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[email] Unexpected error sending ${template} → ${to}: ${errMsg}`)
    const { error: logError } = await supabase.from('email_log').insert({
      from_email: fromEmail,
      to_email: to,
      subject,
      template,
      status: 'failed',
      error: errMsg,
      related_booking_id: relatedBookingId ?? null,
      related_customer_id: relatedCustomerId ?? null,
    })
    if (logError) {
      console.error(
        `[email] Failed to log failed email: ${logError.message}`
      )
    }
    return null
  }
}
