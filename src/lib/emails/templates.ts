// Plain-HTML email templates for MC Racing Sim.
//
// We use raw HTML strings (NOT @react-email/components) for two reasons:
//   1. Zero new dependencies — keeps the bundle and security surface small.
//   2. Inline CSS is the safest path for email clients (Gmail, Outlook, etc.
//      strip <style> tags and ignore most modern CSS).
//
// Brand language (matches src/app/globals.css):
//   - Asphalt-dark background  #0D0D0D
//   - Apex-red headlines       #E62322  (italic bold uppercase, Oswald)
//   - Telemetry-cyan accents   #00AEEF
//   - Body text                #F5F5F5 / #CCC
//
// Each template is a pure function: (typed params) → { subject, html }.

import { formatPrice, formatDateLong } from '../pricing'

// ---------------------------------------------------------------------------
// Brand tokens (inline-CSS-safe — no CSS variables in email!)
// ---------------------------------------------------------------------------

const COLOR = {
  asphaltDark: '#0D0D0D',
  asphalt: '#1A1A1A',
  asphaltLight: '#2A2A2A',
  apexRed: '#E62322',
  apexRedDark: '#B51C1B',
  telemetryCyan: '#00AEEF',
  gridWhite: '#F5F5F5',
  bodyGray: '#CCCCCC',
  mutedGray: '#888888',
} as const

// Single safe stack — Oswald is loaded if present (some clients block external
// fonts) and falls back to Arial Black for the same heavy-bold feel.
const FONT_HEADLINE = "'Oswald', 'Arial Black', Impact, sans-serif"
const FONT_BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const FONT_MONO = "'JetBrains Mono', 'Courier New', monospace"

// ---------------------------------------------------------------------------
// Shared layout fragments
// ---------------------------------------------------------------------------

/**
 * Outer wrapper: dark page background, centered max-width 600px card.
 * Pass the body HTML in `inner`.
 */
function layout(inner: string, previewText?: string): string {
  // Preview text is the dim grey snippet most clients show next to the
  // subject. We hide it visually with display:none + zero-size styling.
  const preview = previewText
    ? `<div style="display:none;font-size:1px;color:${COLOR.asphaltDark};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(previewText)}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>MC Racing Sim Fort Wayne</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.asphaltDark};font-family:${FONT_BODY};color:${COLOR.gridWhite};-webkit-font-smoothing:antialiased;">
    ${preview}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLOR.asphaltDark};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${COLOR.asphalt};border:1px solid #222;">
            ${header()}
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                ${inner}
              </td>
            </tr>
            ${footer()}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function header(): string {
  return `<tr>
  <td style="background-color:${COLOR.asphaltDark};border-bottom:3px solid ${COLOR.apexRed};padding:24px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td>
          <div style="font-family:${FONT_HEADLINE};font-weight:700;font-style:italic;text-transform:uppercase;letter-spacing:0.06em;font-size:32px;line-height:1;color:${COLOR.apexRed};">
            MC Racing Sim
          </div>
          <div style="font-family:${FONT_MONO};text-transform:uppercase;letter-spacing:0.3em;font-size:11px;color:${COLOR.telemetryCyan};margin-top:6px;">
            Fort Wayne
          </div>
        </td>
        <td align="right" style="vertical-align:bottom;">
          <div style="font-family:${FONT_MONO};font-size:10px;color:${COLOR.mutedGray};text-transform:uppercase;letter-spacing:0.15em;">
            // Pit Lane
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>`
}

function footer(): string {
  return `<tr>
  <td style="background-color:${COLOR.asphaltDark};border-top:1px solid #222;padding:20px 32px;">
    <div style="font-family:${FONT_MONO};font-size:11px;line-height:1.7;color:${COLOR.mutedGray};text-align:center;">
      <strong style="color:${COLOR.gridWhite};">MC Racing Sim Fort Wayne</strong><br />
      1205 W Main St, Fort Wayne, IN 46808<br />
      <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a>
      &nbsp;&middot;&nbsp;
      <a href="mailto:mcsimracingfw@gmail.com" style="color:${COLOR.telemetryCyan};text-decoration:none;">mcsimracingfw@gmail.com</a>
    </div>
    <div style="font-family:${FONT_MONO};font-size:10px;color:#555;text-align:center;margin-top:12px;letter-spacing:0.1em;text-transform:uppercase;">
      Tue&ndash;Sun &middot; Noon&ndash;2am &middot; Closed Mondays
    </div>
  </td>
</tr>`
}

// ---------------------------------------------------------------------------
// Reusable building blocks
// ---------------------------------------------------------------------------

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px 0;font-family:${FONT_HEADLINE};font-weight:700;font-style:italic;text-transform:uppercase;letter-spacing:0.04em;font-size:28px;line-height:1.1;color:${COLOR.apexRed};">${escapeHtml(text)}</h1>`
}

function h2(text: string): string {
  return `<h2 style="margin:24px 0 12px 0;font-family:${FONT_HEADLINE};font-weight:600;font-style:italic;text-transform:uppercase;letter-spacing:0.04em;font-size:18px;color:${COLOR.telemetryCyan};">${escapeHtml(text)}</h2>`
}

function p(text: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FONT_BODY};font-size:15px;line-height:1.6;color:${COLOR.bodyGray};">${text}</p>`
}

function divider(): string {
  return `<div style="height:1px;background:linear-gradient(90deg,transparent,${COLOR.apexRed},transparent);margin:24px 0;"></div>`
}

function detailsCard(rows: Array<[string, string]>): string {
  const body = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2A2A2A;font-family:${FONT_MONO};font-size:11px;color:${COLOR.mutedGray};text-transform:uppercase;letter-spacing:0.15em;width:40%;vertical-align:top;">${escapeHtml(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #2A2A2A;font-family:${FONT_BODY};font-size:15px;color:${COLOR.gridWhite};font-weight:600;text-align:right;">${value}</td>
      </tr>`
    )
    .join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLOR.asphaltLight};border-left:3px solid ${COLOR.apexRed};padding:16px 20px;margin:8px 0 20px 0;">
    <tr><td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${body}</table>
    </td></tr>
  </table>`
}

function bookingIdBadge(bookingId: string): string {
  return `<div style="display:inline-block;background-color:${COLOR.asphaltDark};border:1px solid ${COLOR.telemetryCyan};padding:8px 16px;font-family:${FONT_MONO};font-size:13px;color:${COLOR.telemetryCyan};letter-spacing:0.1em;margin-bottom:24px;">
    BOOKING ID&nbsp;//&nbsp;<strong style="color:${COLOR.gridWhite};">${escapeHtml(bookingId)}</strong>
  </div>`
}

function noticeBox(
  title: string,
  body: string,
  variant: 'info' | 'warn' = 'info'
): string {
  const accent = variant === 'warn' ? COLOR.apexRed : COLOR.telemetryCyan
  const bg =
    variant === 'warn' ? 'rgba(230,35,34,0.08)' : 'rgba(0,174,239,0.08)'

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${bg};border-left:4px solid ${accent};margin:20px 0;">
    <tr><td style="padding:16px 20px;">
      <div style="font-family:${FONT_HEADLINE};font-weight:700;text-transform:uppercase;letter-spacing:0.1em;font-size:12px;color:${accent};margin-bottom:8px;">${escapeHtml(title)}</div>
      <div style="font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${COLOR.bodyGray};">${body}</div>
    </td></tr>
  </table>`
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatTimeDisplay(time24: string): string {
  const [hStr, mStr] = time24.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 || 12
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`
}

function formatCents(cents: number): string {
  // formatPrice expects dollars; centavos-safe equivalent inline.
  if (cents % 100 === 0) return formatPrice(cents / 100)
  return `$${(cents / 100).toFixed(2)}`
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ===========================================================================
// TEMPLATE 1: bookingConfirmationEmail
// Sent to the primary racer after a successful booking + card-on-file save.
// ===========================================================================

export interface BookingConfirmationEmailParams {
  customerFirstName: string
  bookingId: string
  sessionDate: string // "YYYY-MM-DD"
  startTime: string // "HH:MM" 24-hour
  durationHours: number
  racerCount: number
  sessionPriceCents: number
  noShowFeeCents: number
}

export function bookingConfirmationEmail(
  params: BookingConfirmationEmailParams
): { subject: string; html: string } {
  const {
    customerFirstName,
    bookingId,
    sessionDate,
    startTime,
    durationHours,
    racerCount,
    sessionPriceCents,
    noShowFeeCents,
  } = params

  const subject = `Green flag! Your MC Racing Sim booking is locked in (${bookingId})`
  const racerWord = racerCount === 1 ? 'Racer' : 'Racers'
  const hourWord = durationHours === 1 ? 'Hour' : 'Hours'

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1(`You're on the grid, ${escapeHtml(customerFirstName)}.`)}
    ${p(`Your session at <strong style="color:${COLOR.gridWhite};">MC Racing Sim Fort Wayne</strong> is confirmed. Here's everything you need to know before you strap in.`)}

    ${h2('Session Details')}
    ${detailsCard([
      ['Date', escapeHtml(formatDateLong(sessionDate))],
      ['Start Time', escapeHtml(formatTimeDisplay(startTime))],
      ['Duration', `${durationHours} ${hourWord}`],
      ['Racers', `${racerCount} ${racerWord}`],
      ['Session Price', `<span style="color:${COLOR.telemetryCyan};">${formatCents(sessionPriceCents)}</span>`],
    ])}

    ${h2('Day of Race')}
    ${p(`Arrive <strong style="color:${COLOR.gridWhite};">15 minutes before your start time</strong>. You'll sign a quick waiver, get a sim walkthrough, and we'll get you on track.`)}
    ${p(`Bring a friend, bring focus, bring your A-game. We've got the rest.`)}

    ${noticeBox(
      'No-Show Policy',
      `A card is on file for <strong style="color:${COLOR.gridWhite};">${formatCents(noShowFeeCents)}</strong> ($20 per seat) charged only if you don't show up and don't cancel at least 90 minutes before your session. Need to reschedule? Just reply to this email or call <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a>.`,
      'warn'
    )}

    ${divider()}

    ${p(`<strong style="color:${COLOR.gridWhite};">Location:</strong> 1205 W Main St, Fort Wayne, IN<br /><strong style="color:${COLOR.gridWhite};">Questions?</strong> Call Mark at (808) 220-2600`)}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `Your session ${formatDateLong(sessionDate)} at ${formatTimeDisplay(startTime)} is confirmed.`),
  }
}

// ===========================================================================
// TEMPLATE 2: friendFyiEmail
// Light FYI to slot 2/3 racers whose email the booker provided.
// ===========================================================================

export interface FriendFyiEmailParams {
  friendName: string
  bookerName: string
  sessionDate: string
  startTime: string
  racerCount: number
}

export function friendFyiEmail(params: FriendFyiEmailParams): {
  subject: string
  html: string
} {
  const { friendName, bookerName, sessionDate, startTime, racerCount } = params

  const subject = `${bookerName} booked you a sim racing session at MC Racing Sim`

  const inner = `
    ${h1(`You're racing, ${escapeHtml(friendName)}.`)}
    ${p(`<strong style="color:${COLOR.gridWhite};">${escapeHtml(bookerName)}</strong> just booked a sim racing session at MC Racing Sim Fort Wayne and put you on the grid.`)}

    ${detailsCard([
      ['Date', escapeHtml(formatDateLong(sessionDate))],
      ['Start Time', escapeHtml(formatTimeDisplay(startTime))],
      ['Racers', `${racerCount} total (you're one of them)`],
      ['Where', '1205 W Main St, Fort Wayne, IN'],
    ])}

    ${noticeBox(
      'Heads Up',
      `Arrive 15 minutes early to sign a waiver and get a quick sim walkthrough. The booker (${escapeHtml(bookerName)}) is handling payment &mdash; you just show up and race.`
    )}

    ${p(`Got questions? Hit up ${escapeHtml(bookerName)} or call us at <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a>.`)}

    ${divider()}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `${bookerName} reserved a spot for you on ${formatDateLong(sessionDate)}.`),
  }
}

// ===========================================================================
// TEMPLATE 3: ownerNewBookingEmail
// Internal notification when a new booking is created.
// ===========================================================================

export interface OwnerNewBookingEmailParams {
  bookingId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  sessionDate: string
  startTime: string
  durationHours: number
  racerCount: number
  sessionPriceCents: number
  source: string
}

export function ownerNewBookingEmail(
  params: OwnerNewBookingEmailParams
): { subject: string; html: string } {
  const {
    bookingId,
    customerName,
    customerEmail,
    customerPhone,
    sessionDate,
    startTime,
    durationHours,
    racerCount,
    sessionPriceCents,
    source,
  } = params

  const subject = `[New Booking] ${customerName} — ${formatDateLong(sessionDate)} ${formatTimeDisplay(startTime)} (${bookingId})`

  // Admin-invited bookings have no card on file — say so honestly so the owner
  // knows a no-show fee can't be auto-charged on these.
  const introLine =
    source === 'admin'
      ? `An admin-invited booking was just created (<strong style="color:${COLOR.gridWhite};">no card on file</strong>). Calendar event created.`
      : `A new ${escapeHtml(source)} booking just came in. Card-on-file captured. Calendar event created.`

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1('New booking on the grid')}
    ${p(introLine)}

    ${h2('Session')}
    ${detailsCard([
      ['Date', escapeHtml(formatDateLong(sessionDate))],
      ['Start', escapeHtml(formatTimeDisplay(startTime))],
      ['Duration', `${durationHours} hr`],
      ['Racers', `${racerCount}`],
      ['Price', `<span style="color:${COLOR.telemetryCyan};">${formatCents(sessionPriceCents)}</span>`],
      ['Source', escapeHtml(source)],
    ])}

    ${h2('Customer')}
    ${detailsCard([
      ['Name', escapeHtml(customerName)],
      ['Email', `<a href="mailto:${escapeHtml(customerEmail)}" style="color:${COLOR.telemetryCyan};text-decoration:none;">${escapeHtml(customerEmail)}</a>`],
      ['Phone', customerPhone ? `<a href="tel:${escapeHtml(customerPhone)}" style="color:${COLOR.telemetryCyan};text-decoration:none;">${escapeHtml(customerPhone)}</a>` : '&mdash;'],
    ])}

    ${divider()}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">Booking ID: <code style="font-family:${FONT_MONO};color:${COLOR.gridWhite};">${escapeHtml(bookingId)}</code></span>`)}
  `

  return {
    subject,
    html: layout(inner, `${customerName} booked ${racerCount} racer${racerCount === 1 ? '' : 's'} for ${formatDateLong(sessionDate)}.`),
  }
}

// ===========================================================================
// TEMPLATE 4: noShowChargeSucceededEmail
// Receipt to the customer after a no-show fee was successfully charged.
// ===========================================================================

export interface NoShowChargeSucceededEmailParams {
  customerFirstName: string
  bookingId: string
  amountCents: number
  sessionDate: string
}

export function noShowChargeSucceededEmail(
  params: NoShowChargeSucceededEmailParams
): { subject: string; html: string } {
  const { customerFirstName, bookingId, amountCents, sessionDate } = params

  const subject = `No-show fee charged: ${formatCents(amountCents)} (Booking ${bookingId})`

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1(`Receipt: no-show fee`)}
    ${p(`Hi ${escapeHtml(customerFirstName)} &mdash; per the policy you agreed to at booking, a no-show fee of <strong style="color:${COLOR.gridWhite};">${formatCents(amountCents)}</strong> was charged to the card on file for the session you missed on ${escapeHtml(formatDateLong(sessionDate))}.`)}

    ${detailsCard([
      ['Booking ID', escapeHtml(bookingId)],
      ['Session Date', escapeHtml(formatDateLong(sessionDate))],
      ['Amount Charged', `<span style="color:${COLOR.apexRed};">${formatCents(amountCents)}</span>`],
      ['Status', '<span style="color:#4ade80;">Succeeded</span>'],
    ])}

    ${noticeBox(
      'Want to Reschedule?',
      `We'd love to see you on track. Book a new session anytime at <a href="https://mcracingsimfortwayne.com" style="color:${COLOR.telemetryCyan};text-decoration:none;">mcracingsimfortwayne.com</a> or call <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a>.`
    )}

    ${divider()}

    ${p(`Questions about this charge? Reply to this email or call Mark at (808) 220-2600.`)}
  `

  return {
    subject,
    html: layout(inner, `${formatCents(amountCents)} no-show fee charged for booking ${bookingId}.`),
  }
}

// ===========================================================================
// TEMPLATE 5: noShowChargeFailedAdminEmail
// Urgent admin alert when a no-show charge fails (card declined, etc.).
// ===========================================================================

export interface NoShowChargeFailedAdminEmailParams {
  bookingId: string
  customerName: string
  customerEmail: string
  amountCents: number
  declineCode: string | null
  failureMessage: string | null
}

export function noShowChargeFailedAdminEmail(
  params: NoShowChargeFailedAdminEmailParams
): { subject: string; html: string } {
  const {
    bookingId,
    customerName,
    customerEmail,
    amountCents,
    declineCode,
    failureMessage,
  } = params

  const subject = `[ACTION NEEDED] No-show charge FAILED — ${customerName} (${bookingId})`

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1('No-show charge failed')}
    ${p(`A no-show fee attempt for <strong style="color:${COLOR.gridWhite};">${escapeHtml(customerName)}</strong> just failed. Manual follow-up required.`)}

    ${detailsCard([
      ['Booking', escapeHtml(bookingId)],
      ['Customer', escapeHtml(customerName)],
      ['Email', `<a href="mailto:${escapeHtml(customerEmail)}" style="color:${COLOR.telemetryCyan};text-decoration:none;">${escapeHtml(customerEmail)}</a>`],
      ['Attempted', `<span style="color:${COLOR.apexRed};">${formatCents(amountCents)}</span>`],
      ['Decline Code', escapeHtml(declineCode ?? 'none')],
      ['Failure Message', escapeHtml(failureMessage ?? 'No details from Stripe')],
    ])}

    ${noticeBox(
      'Next Step',
      `Pull up the booking in the admin panel to see the full failure log. Options: contact the customer directly, retry the charge, or write it off.`,
      'warn'
    )}

    ${divider()}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">This is an automated alert from the MC Racing Sim admin system.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `${formatCents(amountCents)} charge failed for ${customerName}.`),
  }
}

// ===========================================================================
// TEMPLATE 6: inviteBookingEmail
// Sent to a customer when an admin INVITES them to a booking (no card on file,
// no no-show fee). Different from bookingConfirmationEmail — no card/no-show
// language, since the admin set this up on their behalf.
// ===========================================================================

export interface InviteBookingEmailParams {
  customerFirstName: string
  bookingId: string
  sessionDate: string
  startTime: string
  durationHours: number
  racerCount: number
  sessionPriceCents: number
}

export function inviteBookingEmail(
  params: InviteBookingEmailParams
): { subject: string; html: string } {
  const {
    customerFirstName,
    bookingId,
    sessionDate,
    startTime,
    durationHours,
    racerCount,
    sessionPriceCents,
  } = params

  const subject = `You're booked at MC Racing Sim — ${formatDateLong(sessionDate)} (${bookingId})`
  const racerWord = racerCount === 1 ? 'Racer' : 'Racers'
  const hourWord = durationHours === 1 ? 'Hour' : 'Hours'

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1(`We saved you a spot, ${escapeHtml(customerFirstName)}.`)}
    ${p(`MC Racing Sim Fort Wayne booked a sim racing session for you. Here are the details &mdash; no payment needed to reserve it.`)}

    ${h2('Your Session')}
    ${detailsCard([
      ['Date', escapeHtml(formatDateLong(sessionDate))],
      ['Start Time', escapeHtml(formatTimeDisplay(startTime))],
      ['Duration', `${durationHours} ${hourWord}`],
      ['Racers', `${racerCount} ${racerWord}`],
      ['Price (due at venue)', `<span style="color:${COLOR.telemetryCyan};">${formatCents(sessionPriceCents)}</span>`],
    ])}

    ${h2('Day of Race')}
    ${p(`Arrive <strong style="color:${COLOR.gridWhite};">15 minutes before your start time</strong>. You'll sign a quick waiver, get a sim walkthrough, and we'll get you on track. Pay when you arrive.`)}

    ${noticeBox(
      'Need to change it?',
      `Just reply to this email or call <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a> and we'll sort it out.`
    )}

    ${divider()}

    ${p(`<strong style="color:${COLOR.gridWhite};">Location:</strong> 1205 W Main St, Fort Wayne, IN`)}
    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `We booked you a session on ${formatDateLong(sessionDate)} at ${formatTimeDisplay(startTime)}.`),
  }
}

// ===========================================================================
// TEMPLATE 7: bookingReminderEmail
// Day-before reminder. Sent by the reminder cron for any confirmed booking.
// ===========================================================================

export interface BookingReminderEmailParams {
  customerFirstName: string
  bookingId: string
  sessionDate: string
  startTime: string
  durationHours: number
  racerCount: number
}

export function bookingReminderEmail(
  params: BookingReminderEmailParams
): { subject: string; html: string } {
  const {
    customerFirstName,
    bookingId,
    sessionDate,
    startTime,
    durationHours,
    racerCount,
  } = params

  const subject = `Reminder: your MC Racing Sim session is tomorrow 🏁`
  const racerWord = racerCount === 1 ? 'Racer' : 'Racers'
  const hourWord = durationHours === 1 ? 'Hour' : 'Hours'

  const inner = `
    ${bookingIdBadge(bookingId)}
    ${h1(`See you tomorrow, ${escapeHtml(customerFirstName)}.`)}
    ${p(`Quick reminder that your session at <strong style="color:${COLOR.gridWhite};">MC Racing Sim Fort Wayne</strong> is coming up tomorrow.`)}

    ${detailsCard([
      ['Date', escapeHtml(formatDateLong(sessionDate))],
      ['Start Time', escapeHtml(formatTimeDisplay(startTime))],
      ['Duration', `${durationHours} ${hourWord}`],
      ['Racers', `${racerCount} ${racerWord}`],
    ])}

    ${p(`Arrive <strong style="color:${COLOR.gridWhite};">15 minutes early</strong> to sign your waiver and get a quick walkthrough before you strap in.`)}

    ${noticeBox(
      'Need to reschedule?',
      `Reply to this email or call <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a> as soon as you can.`
    )}

    ${divider()}

    ${p(`<strong style="color:${COLOR.gridWhite};">Location:</strong> 1205 W Main St, Fort Wayne, IN`)}
    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `Your session is tomorrow at ${formatTimeDisplay(startTime)} — arrive 15 min early.`),
  }
}

// ===========================================================================
// TEMPLATE 8: sessionThankYouEmail
// Sent after a completed session to a RETURNING racer (plain thank-you + CTA).
// ===========================================================================

export interface SessionThankYouEmailParams {
  customerFirstName: string
}

export function sessionThankYouEmail(
  params: SessionThankYouEmailParams
): { subject: string; html: string } {
  const { customerFirstName } = params

  const subject = `Thanks for racing with us 🏁`

  const inner = `
    ${h1(`Great runs today, ${escapeHtml(customerFirstName)}.`)}
    ${p(`Thanks for racing at <strong style="color:${COLOR.gridWhite};">MC Racing Sim Fort Wayne</strong>. We hope you had a blast on track.`)}

    ${noticeBox(
      'Come back and beat your time',
      `Book your next session anytime at <a href="https://www.mcracingfortwayne.com/booking" style="color:${COLOR.telemetryCyan};text-decoration:none;">mcracingfortwayne.com</a> or call <a href="tel:+18082202600" style="color:${COLOR.telemetryCyan};text-decoration:none;">(808) 220-2600</a>.`
    )}

    ${divider()}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `Thanks for racing with us — book your next session anytime.`),
  }
}

// ===========================================================================
// TEMPLATE 9: firstTimerThankYouEmail
// Sent after a racer's FIRST completed session. Includes their personal
// "First-Time Racer 50% off" referral code to share with friends.
// ===========================================================================

export interface FirstTimerThankYouEmailParams {
  customerFirstName: string
  referralCode: string
}

export function firstTimerThankYouEmail(
  params: FirstTimerThankYouEmailParams
): { subject: string; html: string } {
  const { customerFirstName, referralCode } = params

  const subject = `Your first race is on the board — here's 50% off for your crew 🏁`

  // Big, tappable-looking code block. Kept table-based for email-client safety.
  const codeBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px 0;">
      <tr><td align="center" style="background-color:${COLOR.asphaltDark};border:2px dashed ${COLOR.telemetryCyan};padding:20px;">
        <div style="font-family:${FONT_MONO};font-size:11px;color:${COLOR.mutedGray};text-transform:uppercase;letter-spacing:0.2em;margin-bottom:8px;">Your referral code</div>
        <div style="font-family:${FONT_HEADLINE};font-weight:700;font-size:30px;letter-spacing:0.12em;color:${COLOR.telemetryCyan};">${escapeHtml(referralCode)}</div>
      </td></tr>
    </table>`

  const inner = `
    ${h1(`You made your first laps, ${escapeHtml(customerFirstName)}.`)}
    ${p(`Thanks for racing at <strong style="color:${COLOR.gridWhite};">MC Racing Sim Fort Wayne</strong> — and welcome to the grid. To say thanks, here's a code to bring your friends in at <strong style="color:${COLOR.gridWhite};">half price</strong>.`)}

    ${codeBlock}

    ${noticeBox(
      'How it works',
      `Share <strong style="color:${COLOR.gridWhite};">${escapeHtml(referralCode)}</strong> with your crew. Each friend gets <strong style="color:${COLOR.gridWhite};">50% off</strong> a session (up to 2 hours). Good for up to <strong style="color:${COLOR.gridWhite};">3 friends</strong> / 6 discounted hours total. They just enter it at checkout when they book online.`
    )}

    ${p(`Want to come back yourself? Book anytime at <a href="https://www.mcracingfortwayne.com/booking" style="color:${COLOR.telemetryCyan};text-decoration:none;">mcracingfortwayne.com</a>.`)}

    ${divider()}

    ${p(`<span style="color:${COLOR.mutedGray};font-size:13px;">See you trackside.</span>`)}
  `

  return {
    subject,
    html: layout(inner, `Thanks for your first race — here's 50% off for up to 3 friends.`),
  }
}
