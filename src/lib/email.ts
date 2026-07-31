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

// Fallback only — production sets RESEND_FROM_EMAIL (the Resend-verified
// send.* subdomain). The domain here is the real site (mcracingfortwayne.com);
// it was previously the nonexistent "mcracingsimfortwayne.com".
const DEFAULT_FROM_EMAIL = 'MC Racing Sim <bookings@mcracingfortwayne.com>'
const DEFAULT_OWNER_EMAIL = 'mcracingfortwayne@gmail.com'

function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL
}

export function getOwnerNotificationEmail(): string {
  return process.env.OWNER_NOTIFICATION_EMAIL || DEFAULT_OWNER_EMAIL
}

// Replies must go to a monitored mailbox: the apex domain has no MX records,
// so replies to the from-address would bounce. Overridable via env.
function getReplyToEmail(): string {
  return process.env.RESEND_REPLY_TO_EMAIL || getOwnerNotificationEmail()
}

/**
 * Crude-but-effective HTML → plain-text for the text/plain MIME part.
 * Multipart bodies score better with spam filters than HTML-only, and
 * text-mode clients get something readable.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
  /**
   * The transaction this email is about (receipts / thank-yous). Lets the admin
   * panel and the on-reader POS answer "was a receipt sent for THIS sale, and to
   * what address?" — related_customer_id is too coarse, since one customer has
   * many transactions.
   */
  relatedTransactionId?: string | null
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
  const {
    to,
    subject,
    html,
    template,
    relatedBookingId,
    relatedCustomerId,
    relatedTransactionId,
  } = params

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
      related_transaction_id: relatedTransactionId ?? null,
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
      // Multipart (html + text) deliverability + a monitored reply address —
      // the apex domain has no MX, so replying to the from-address bounces.
      text: htmlToPlainText(html),
      replyTo: getReplyToEmail(),
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
        related_transaction_id: relatedTransactionId ?? null,
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
      related_transaction_id: relatedTransactionId ?? null,
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
      related_transaction_id: relatedTransactionId ?? null,
    })
    if (logError) {
      console.error(
        `[email] Failed to log failed email: ${logError.message}`
      )
    }
    return null
  }
}
