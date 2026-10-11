import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake Google Calendar API: records what we send, answers what the test says.
const { api } = vi.hoisted(() => ({
  api: {
    insert: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
  },
}))
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class {} },
    calendar: () => ({ events: { insert: api.insert, get: api.get, patch: api.patch } }),
  },
}))

process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'svc@example.com'
process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'key'
import { createBookingCalendarEvent, ensureBookingCalendarEvent } from '../calendar'

const BRYCE = {
  bookingId: 'MC-BRYCE1010',
  customerName: 'Bryce M',
  customerEmail: 'b@example.com',
  customerPhone: null,
  sessionDate: '2026-10-10',
  startTime: '23:30:00',
  durationHours: 2,
  racerCount: 3,
  sessionPriceCents: 30000,
  noShowFeeCents: 6000,
  source: 'online' as const,
}

beforeEach(() => {
  api.insert.mockReset().mockResolvedValue({ data: { id: 'evt_new' } })
  api.get.mockReset()
  api.patch.mockReset().mockResolvedValue({ data: {} })
})

describe('createBookingCalendarEvent', () => {
  it('sends an 11:30pm-1:30am session ending on the NEXT day (Google rejected the old payload)', async () => {
    await createBookingCalendarEvent(BRYCE)
    const body = api.insert.mock.calls[0][0].requestBody
    expect(body.start).toEqual({ dateTime: '2026-10-10T23:30:00', timeZone: 'America/New_York' })
    expect(body.end).toEqual({ dateTime: '2026-10-11T01:30:00', timeZone: 'America/New_York' })
  })

  it('puts a 1am session on the morning after its evening', async () => {
    await createBookingCalendarEvent({ ...BRYCE, sessionDate: '2026-10-09', startTime: '01:00:00', durationHours: 1.5 })
    const body = api.insert.mock.calls[0][0].requestBody
    expect(body.start.dateTime).toBe('2026-10-10T01:00:00')
    expect(body.end.dateTime).toBe('2026-10-10T02:30:00')
  })
})

describe('ensureBookingCalendarEvent', () => {
  it('creates an event when the booking has none', async () => {
    expect(await ensureBookingCalendarEvent(null, BRYCE)).toEqual({ action: 'created', eventId: 'evt_new', reason: 'missing' })
  })

  it('leaves a correct event alone (no rewrite of notes typed into it)', async () => {
    api.get.mockResolvedValue({
      data: { status: 'confirmed', start: { dateTime: '2026-10-10T23:30:00-04:00' }, end: { dateTime: '2026-10-11T01:30:00-04:00' } },
    })
    expect(await ensureBookingCalendarEvent('evt_1', BRYCE)).toEqual({ action: 'ok', eventId: 'evt_1' })
    expect(api.get.mock.calls[0][0].timeZone).toBe('America/New_York')
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.insert).not.toHaveBeenCalled()
  })

  it('fixes an event on the wrong day, touching only its times', async () => {
    api.get.mockResolvedValue({
      data: { status: 'confirmed', start: { dateTime: '2026-10-09T01:00:00-04:00' }, end: { dateTime: '2026-10-09T02:30:00-04:00' } },
    })
    const out = await ensureBookingCalendarEvent('evt_1', { ...BRYCE, sessionDate: '2026-10-09', startTime: '01:00:00', durationHours: 1.5 })
    expect(out).toEqual({ action: 'retimed', eventId: 'evt_1' })
    expect(api.patch.mock.calls[0][0].requestBody).toEqual({
      start: { dateTime: '2026-10-10T01:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-10-10T02:30:00', timeZone: 'America/New_York' },
    })
  })

  it('recreates an event deleted in Google Calendar (404 or cancelled)', async () => {
    api.get.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { code: 404 }))
    expect(await ensureBookingCalendarEvent('evt_gone', BRYCE)).toMatchObject({ action: 'created', reason: 'deleted_in_calendar' })
    api.get.mockResolvedValueOnce({ data: { status: 'cancelled' } })
    expect(await ensureBookingCalendarEvent('evt_trashed', BRYCE)).toMatchObject({ action: 'created', reason: 'deleted_in_calendar' })
  })

  it('surfaces other Google errors instead of creating duplicates', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('Backend Error'), { code: 503 }))
    await expect(ensureBookingCalendarEvent('evt_1', BRYCE)).rejects.toThrow('Backend Error')
    expect(api.insert).not.toHaveBeenCalled()
  })
})
