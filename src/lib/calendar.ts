// Google Calendar integration for MC Racing Sim Fort Wayne.
//
// Every confirmed booking writes a colored event onto the shop's primary
// calendar (mcracingfortwayne@gmail.com) so Mark can see his schedule from
// any device with Google Calendar installed — phone, tablet, smart display.
//
// AUTH MODEL: service account, not OAuth user flow. Mark creates a service
// account in his Google Cloud project, downloads its JSON key, and shares
// the calendar with the service account's email address (with "Make changes
// to events" permission). We use the JWT credentials to write events on
// behalf of the calendar owner — no consent screens, no token refresh, no
// per-user OAuth dance.
//
// GRACEFUL DEGRADATION: if the env vars aren't populated yet (e.g. dev,
// preview, or before Mark finishes the Google Cloud setup), every export
// becomes a no-op that logs a warning and returns null. The booking flow
// must never break because the calendar isn't wired up.
//
// See SETUP_GOOGLE_CALENDAR.md in the project root for the one-time setup.

import { google, type calendar_v3 } from 'googleapis'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

// All times in the app are wall-clock Fort Wayne time. Using a named
// timezone (rather than a fixed UTC offset) keeps DST correct automatically.
const CALENDAR_TIMEZONE = 'America/New_York'

// Google Calendar color IDs (event colors, not calendar colors).
// Reference: https://developers.google.com/calendar/api/v3/reference/colors/get
// We use distinct colors so Mark can scan his calendar and instantly see
// which bookings came in via the website vs. were entered manually.
const COLOR_BY_SOURCE: Record<NonNullable<BookingSource>, string> = {
  online: '11',   // Tomato — bright red, draws the eye for fresh online bookings
  admin: '5',     // Banana — yellow, manually entered by staff
  imported: '8',  // Graphite — neutral gray, migrated from the old system
}
const DEFAULT_COLOR = COLOR_BY_SOURCE.online

// ---------------------------------------------------------------------------
// Lazy singleton client
// ---------------------------------------------------------------------------

let cachedClient: calendar_v3.Calendar | null = null
let warnedAboutMissingCreds = false

/**
 * Build (or return) the Google Calendar v3 client.
 *
 * Returns null — without throwing — if the service account credentials
 * aren't configured. Callers MUST handle the null case; the booking flow
 * relies on this for graceful degradation in dev/preview.
 */
function getCalendarClient(): calendar_v3.Calendar | null {
  if (cachedClient) return cachedClient

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    if (!warnedAboutMissingCreds) {
      console.warn(
        '[calendar] GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ' +
          'is not set — calendar event creation will be skipped. See SETUP_GOOGLE_CALENDAR.md.'
      )
      warnedAboutMissingCreds = true
    }
    return null
  }

  // Vercel env vars store newlines as the literal two-character sequence
  // `\n`. The PEM parser needs actual newlines, so un-escape before passing
  // to the JWT constructor. If the key already contains real newlines
  // (e.g. someone pasted it raw via the CLI) this replace is a no-op.
  const privateKey = rawKey.replace(/\\n/g, '\n')

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: SCOPES,
  })

  cachedClient = google.calendar({ version: 'v3', auth })
  return cachedClient
}

function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || 'mcracingfortwayne@gmail.com'
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BookingSource = 'online' | 'admin' | 'imported'

export interface CreateBookingCalendarEventInput {
  bookingId: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  sessionDate: string   // "YYYY-MM-DD"
  startTime: string     // "HH:MM" 24-hour
  durationHours: 1 | 2 | 3
  racerCount: 1 | 2 | 3
  sessionPriceCents: number
  noShowFeeCents: number
  source?: BookingSource
}

export interface UpdateBookingCalendarEventInput {
  /** New summary line — typically when the booking ID, name, or racer count changes. */
  summary?: string
  /** New description body — typically when status/notes change. */
  description?: string
  /** Updated start time as "HH:MM" 24-hour wall-clock. */
  startTime?: string
  /** Required alongside startTime if duration changed. */
  durationHours?: 1 | 2 | 3
  /** Updated session date as "YYYY-MM-DD". */
  sessionDate?: string
  /** Override the event color (use COLOR_BY_SOURCE values). */
  colorId?: string
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Combine a "YYYY-MM-DD" date and "HH:MM" 24-hour time into the
 * { dateTime, timeZone } object that the Calendar API expects.
 *
 * IMPORTANT: we pass the wall-clock string WITHOUT a UTC offset and supply
 * timeZone separately. Google will interpret the wall-clock string in the
 * given timezone — which is what we want, because business hours are always
 * Fort Wayne local time regardless of the server's TZ.
 */
function toCalendarDateTime(
  sessionDate: string,
  time: string
): calendar_v3.Schema$EventDateTime {
  // `time` may arrive as "HH:MM" (from the booking form) or "HH:MM:SS" (from
  // the Postgres TIME column). Normalize to a zero-padded "HH:MM" so we always
  // emit a valid "YYYY-MM-DDTHH:MM:00" — appending ":00" to a value that
  // already had seconds produced "...T13:00:00:00" and Google rejected it 400.
  const [h = '00', m = '00'] = time.split(':')
  const hhmm = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  return {
    dateTime: `${sessionDate}T${hhmm}:00`,
    timeZone: CALENDAR_TIMEZONE,
  }
}

/**
 * Add `hours` to "HH:MM" wall-clock, wrapping past midnight.
 * Mirrors the same helper in src/lib/booking.ts to keep end-time math
 * identical between the DB row and the calendar event.
 */
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const endHour = (h + hours) % 24
  return `${String(endHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function buildSummary(input: CreateBookingCalendarEventInput): string {
  const racerWord = input.racerCount === 1 ? 'racer' : 'racers'
  return `🏁 ${input.bookingId} — ${input.customerName} (${input.racerCount} ${racerWord})`
}

function buildDescription(input: CreateBookingCalendarEventInput): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://mcracingfortwayne.com'
  const adminLink = `${baseUrl}/admin/bookings/${input.bookingId}`

  const lines = [
    `Booking ID: ${input.bookingId}`,
    `Source: ${input.source ?? 'online'}`,
    '',
    `Racers: ${input.racerCount}`,
    `Duration: ${input.durationHours} hour${input.durationHours === 1 ? '' : 's'}`,
    `Session price: ${formatMoney(input.sessionPriceCents)}`,
    `No-show fee on file: ${formatMoney(input.noShowFeeCents)}`,
    '',
    'Primary contact:',
    `  ${input.customerName}`,
    `  ${input.customerEmail}`,
  ]
  if (input.customerPhone) {
    lines.push(`  ${input.customerPhone}`)
  }
  lines.push('', `View / manage: ${adminLink}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Create a calendar event for a new booking.
 *
 * Returns the Google Calendar event ID on success — callers should persist
 * it on the booking row so we can update or delete the event later (e.g.
 * when the booking is rescheduled or cancelled).
 *
 * Returns null in two cases:
 *   1. Credentials are missing (graceful no-op for dev/preview).
 *   2. Google returned a 200 but no event ID (defensive — shouldn't happen).
 *
 * THROWS on actual API failures (network, auth, bad calendar share). The
 * caller in booking.ts wraps this in a fire-and-forget .catch() so the
 * booking response is never blocked.
 */
export async function createBookingCalendarEvent(
  input: CreateBookingCalendarEventInput
): Promise<string | null> {
  const calendar = getCalendarClient()
  if (!calendar) return null

  const endTime = addHours(input.startTime, input.durationHours)
  const source = input.source ?? 'online'

  const event: calendar_v3.Schema$Event = {
    summary: buildSummary(input),
    description: buildDescription(input),
    start: toCalendarDateTime(input.sessionDate, input.startTime),
    end: toCalendarDateTime(input.sessionDate, endTime),
    colorId: COLOR_BY_SOURCE[source] ?? DEFAULT_COLOR,
    // Reminders help Mark stay on top of his schedule without needing to
    // open the app — the email gives him a day to prep, the popup is a
    // last-minute heads-up before the session starts.
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 60 },      // 1 hour before
      ],
    },
    // Stamp the booking ID on the event so we can correlate without
    // relying on summary text (which may be edited in the calendar UI).
    extendedProperties: {
      private: {
        booking_id: input.bookingId,
        source,
      },
    },
  }

  const response = await calendar.events.insert({
    calendarId: getCalendarId(),
    requestBody: event,
  })

  return response.data.id ?? null
}

/**
 * Update an existing booking calendar event (e.g. reschedule, status change).
 * Returns true on success, false if calendar isn't configured.
 *
 * Uses PATCH semantics — only the fields you pass are changed; everything
 * else is preserved.
 */
export async function updateBookingCalendarEvent(
  eventId: string,
  updates: UpdateBookingCalendarEventInput
): Promise<boolean> {
  const calendar = getCalendarClient()
  if (!calendar) return false

  const patch: calendar_v3.Schema$Event = {}
  if (updates.summary !== undefined) patch.summary = updates.summary
  if (updates.description !== undefined) patch.description = updates.description
  if (updates.colorId !== undefined) patch.colorId = updates.colorId

  // Date/time updates: if any of date/start/duration changes, we must
  // recompute end and send both start + end together. Partial start-only
  // updates would leave the event with a stale end time.
  if (
    updates.sessionDate !== undefined ||
    updates.startTime !== undefined ||
    updates.durationHours !== undefined
  ) {
    if (
      updates.sessionDate === undefined ||
      updates.startTime === undefined ||
      updates.durationHours === undefined
    ) {
      throw new Error(
        'updateBookingCalendarEvent: sessionDate, startTime, and durationHours must be passed together'
      )
    }
    const endTime = addHours(updates.startTime, updates.durationHours)
    patch.start = toCalendarDateTime(updates.sessionDate, updates.startTime)
    patch.end = toCalendarDateTime(updates.sessionDate, endTime)
  }

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId,
    requestBody: patch,
  })

  return true
}

/**
 * Fully re-sync an event to match an edited booking. Unlike
 * updateBookingCalendarEvent (PATCH of individual fields), this rebuilds the
 * summary, description, start, end, and color from the complete booking input
 * — the same builders used at creation — so a rescheduled/re-priced/re-sized
 * booking never leaves stale text or times on the calendar.
 *
 * Returns true on success, false if calendar isn't configured. THROWS on real
 * API errors (callers wrap best-effort).
 */
export async function resyncBookingCalendarEvent(
  eventId: string,
  input: CreateBookingCalendarEventInput
): Promise<boolean> {
  const calendar = getCalendarClient()
  if (!calendar) return false

  const endTime = addHours(input.startTime, input.durationHours)
  const source = input.source ?? 'online'

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId,
    requestBody: {
      summary: buildSummary(input),
      description: buildDescription(input),
      start: toCalendarDateTime(input.sessionDate, input.startTime),
      end: toCalendarDateTime(input.sessionDate, endTime),
      colorId: COLOR_BY_SOURCE[source] ?? DEFAULT_COLOR,
    },
  })

  return true
}

/**
 * Delete a calendar event — for cancellations.
 * Returns true on success, false if calendar isn't configured.
 *
 * If the event was already deleted in the calendar UI (404 from Google),
 * we swallow the error and return true — the desired end state is "no
 * event exists," and that's already true.
 */
export async function deleteBookingCalendarEvent(
  eventId: string
): Promise<boolean> {
  const calendar = getCalendarClient()
  if (!calendar) return false

  try {
    await calendar.events.delete({
      calendarId: getCalendarId(),
      eventId,
    })
    return true
  } catch (err: unknown) {
    // Google's typed error has a numeric `code` for HTTP status.
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: number }).code
        : undefined
    if (status === 404 || status === 410) {
      // Already gone — treat as success.
      return true
    }
    throw err
  }
}
