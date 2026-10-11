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
import { bookingWallClockWindow } from './time'

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
  durationHours: number
  racerCount: number
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
  durationHours?: number
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
 * Start + end for a booking event on their REAL dates. Sessions crossing
 * midnight end the next day, and post-midnight starts belong to the next day
 * (see bookingWallClockWindow). Every booking event goes through here.
 */
function bookingEventTimes(
  sessionDate: string,
  startTime: string,
  durationHours: number
): { start: calendar_v3.Schema$EventDateTime; end: calendar_v3.Schema$EventDateTime } {
  const w = bookingWallClockWindow(sessionDate, startTime, durationHours)
  return {
    start: toCalendarDateTime(w.startDate, w.startTime),
    end: toCalendarDateTime(w.endDate, w.endTime),
  }
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

  const source = input.source ?? 'online'

  const event: calendar_v3.Schema$Event = {
    summary: buildSummary(input),
    description: buildDescription(input),
    ...bookingEventTimes(input.sessionDate, input.startTime, input.durationHours),
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

/** Next calendar day for "YYYY-MM-DD" (Google all-day end.date is exclusive). */
function nextDayISO(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Raw minutes-since-midnight for "HH:MM"/"HH:MM:SS" (no extended-minutes wrap). */
function rawMinutes(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Create a Google Calendar event for an availability BLOCK — a staff-set
 * "personal appointment" / closure, NOT a customer booking. Whole-day blocks
 * (null times) become an all-day event; timed blocks span their window (with
 * past-midnight handling). Distinct red color + a "Blocked" title so it never
 * looks like a paying session. Returns the event id (or null if calendar is
 * unconfigured). THROWS on real API failures — callers should .catch() it so a
 * calendar hiccup never blocks the block itself.
 */
export async function createBlockCalendarEvent(input: {
  blockId: string
  blockDate: string
  startTime: string | null // null (with endTime null) = whole day
  endTime: string | null
  reason: string | null
}): Promise<string | null> {
  const calendar = getCalendarClient()
  if (!calendar) return null

  const label = input.reason?.trim() || 'Unavailable'
  const wholeDay = !input.startTime || !input.endTime

  const event: calendar_v3.Schema$Event = {
    summary: `🚫 Blocked — ${label}`,
    description: 'Availability block (staff-set, not a customer booking). This time is closed to online booking.',
    colorId: '11', // tomato/red — obviously not a booking
    extendedProperties: { private: { block_id: input.blockId, source: 'block' } },
  }

  if (wholeDay) {
    event.start = { date: input.blockDate }
    event.end = { date: nextDayISO(input.blockDate) } // end.date is exclusive
  } else {
    const start = input.startTime as string
    const end = input.endTime as string
    // A block whose end wraps past midnight (e.g. 23:00 → 01:00) ends next day.
    const endDate = rawMinutes(end) <= rawMinutes(start) ? nextDayISO(input.blockDate) : input.blockDate
    event.start = toCalendarDateTime(input.blockDate, start)
    event.end = toCalendarDateTime(endDate, end)
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
    const times = bookingEventTimes(updates.sessionDate, updates.startTime, updates.durationHours)
    patch.start = times.start
    patch.end = times.end
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

  const source = input.source ?? 'online'

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId,
    requestBody: {
      summary: buildSummary(input),
      description: buildDescription(input),
      ...bookingEventTimes(input.sessionDate, input.startTime, input.durationHours),
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

export type EnsureEventOutcome =
  | { action: 'ok'; eventId: string; duplicatesRemoved: number }
  | { action: 'created'; eventId: string; reason: 'missing' | 'deleted_in_calendar'; duplicatesRemoved: number }
  | { action: 'adopted'; eventId: string; duplicatesRemoved: number }
  | { action: 'retimed'; eventId: string; duplicatesRemoved: number }
  | { action: 'skipped'; reason: 'calendar_not_configured' }

/**
 * Every live event on the calendar stamped with this booking id (we set
 * extendedProperties.private.booking_id on every event we create), oldest first.
 */
async function findBookingEvents(
  calendar: calendar_v3.Calendar,
  bookingId: string
): Promise<calendar_v3.Schema$Event[]> {
  const res = await calendar.events.list({
    calendarId: getCalendarId(),
    privateExtendedProperty: [`booking_id=${bookingId}`],
    showDeleted: false,
    singleEvents: true,
    maxResults: 50,
  })
  return (res.data.items ?? [])
    .filter((e) => e.id && e.status !== 'cancelled')
    .sort((a, b) => (a.created ?? '').localeCompare(b.created ?? ''))
}

/** Delete every event for this booking except `keepId`. Returns how many were removed. */
async function removeDuplicateEvents(
  calendar: calendar_v3.Calendar,
  events: calendar_v3.Schema$Event[],
  keepId: string
): Promise<number> {
  let removed = 0
  for (const e of events) {
    if (!e.id || e.id === keepId) continue
    try {
      await calendar.events.delete({ calendarId: getCalendarId(), eventId: e.id, sendUpdates: 'none' })
      removed++
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: number }).code : undefined
      if (status !== 404 && status !== 410) throw err
    }
  }
  return removed
}

/**
 * Make sure a booking has a calendar event with the right times. Used by the
 * 15-minute sync job so a failed insert (or an event deleted by hand in Google
 * Calendar) is repaired automatically instead of silently missing forever.
 *
 * Only the TIMES are corrected on an existing event — summary/description are
 * left alone so notes typed into the event in Google Calendar survive.
 * THROWS on real API errors; the caller records them per booking.
 */
export async function ensureBookingCalendarEvent(
  existingEventId: string | null,
  input: CreateBookingCalendarEventInput
): Promise<EnsureEventOutcome> {
  const calendar = getCalendarClient()
  if (!calendar) return { action: 'skipped', reason: 'calendar_not_configured' }

  // Ask the CALENDAR, not just our database, whether this booking already has
  // events. That makes creation idempotent per booking: a stale database read
  // can never produce a second event, and any duplicates get cleaned up.
  const tagged = await findBookingEvents(calendar, input.bookingId)

  if (!existingEventId) {
    if (tagged.length > 0) {
      const keep = tagged[0].id as string
      const duplicatesRemoved = await removeDuplicateEvents(calendar, tagged, keep)
      return { action: 'adopted', eventId: keep, duplicatesRemoved }
    }
    const id = await createBookingCalendarEvent(input)
    if (!id) throw new Error('Calendar insert returned no event id')
    return { action: 'created', eventId: id, reason: 'missing', duplicatesRemoved: 0 }
  }

  const duplicatesRemoved = tagged.some((e) => e.id === existingEventId)
    ? await removeDuplicateEvents(calendar, tagged, existingEventId)
    : 0

  let current: calendar_v3.Schema$Event | null = null
  try {
    const res = await calendar.events.get({
      calendarId: getCalendarId(),
      eventId: existingEventId,
      // Return times in venue local time so they compare against ours.
      timeZone: CALENDAR_TIMEZONE,
    })
    current = res.data
  } catch (err: unknown) {
    const status =
      typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: number }).code : undefined
    if (status !== 404 && status !== 410) throw err
  }

  if (!current || current.status === 'cancelled') {
    // Our saved id is gone. Reuse another tagged event if one exists before
    // creating a fresh one.
    const others = tagged.filter((e) => e.id !== existingEventId)
    if (others.length > 0) {
      const keep = others[0].id as string
      return { action: 'adopted', eventId: keep, duplicatesRemoved: await removeDuplicateEvents(calendar, others, keep) }
    }
    const id = await createBookingCalendarEvent(input)
    if (!id) throw new Error('Calendar insert returned no event id')
    return { action: 'created', eventId: id, reason: 'deleted_in_calendar', duplicatesRemoved }
  }

  const want = bookingEventTimes(input.sessionDate, input.startTime, input.durationHours)
  // "YYYY-MM-DDTHH:MM" — Google returns e.g. "2026-10-10T23:30:00-04:00".
  const minute = (dt: string | null | undefined) => (dt ?? '').slice(0, 16)
  if (
    minute(current.start?.dateTime) === minute(want.start.dateTime) &&
    minute(current.end?.dateTime) === minute(want.end.dateTime)
  ) {
    return { action: 'ok', eventId: existingEventId, duplicatesRemoved }
  }

  await calendar.events.patch({
    calendarId: getCalendarId(),
    eventId: existingEventId,
    requestBody: { start: want.start, end: want.end },
  })
  return { action: 'retimed', eventId: existingEventId, duplicatesRemoved }
}
