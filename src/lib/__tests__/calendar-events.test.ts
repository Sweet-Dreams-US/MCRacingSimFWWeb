import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake Google Calendar API: records what we send, answers what the test says.
const { api } = vi.hoisted(() => ({
  api: {
    insert: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    list: vi.fn(),
    del: vi.fn(),
  },
}))
vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: class {} },
    calendar: () => ({ events: { insert: api.insert, get: api.get, patch: api.patch, list: api.list, delete: api.del } }),
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
  api.list.mockReset().mockResolvedValue({ data: { items: [] } })
  api.del.mockReset().mockResolvedValue({ data: {} })
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
    expect(await ensureBookingCalendarEvent(null, BRYCE)).toEqual({ action: 'created', eventId: 'evt_new', reason: 'missing', duplicatesRemoved: 0 })
  })

  it('leaves a correct event alone (no rewrite of notes typed into it)', async () => {
    api.get.mockResolvedValue({
      data: { status: 'confirmed', start: { dateTime: '2026-10-10T23:30:00-04:00' }, end: { dateTime: '2026-10-11T01:30:00-04:00' } },
    })
    expect(await ensureBookingCalendarEvent('evt_1', BRYCE)).toEqual({ action: 'ok', eventId: 'evt_1', duplicatesRemoved: 0 })
    expect(api.get.mock.calls[0][0].timeZone).toBe('America/New_York')
    expect(api.patch).not.toHaveBeenCalled()
    expect(api.insert).not.toHaveBeenCalled()
  })

  it('fixes an event on the wrong day, touching only its times', async () => {
    api.get.mockResolvedValue({
      data: { status: 'confirmed', start: { dateTime: '2026-10-09T01:00:00-04:00' }, end: { dateTime: '2026-10-09T02:30:00-04:00' } },
    })
    const out = await ensureBookingCalendarEvent('evt_1', { ...BRYCE, sessionDate: '2026-10-09', startTime: '01:00:00', durationHours: 1.5 })
    expect(out).toEqual({ action: 'retimed', eventId: 'evt_1', duplicatesRemoved: 0 })
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

// ---------------------------------------------------------------------------
// 2026-10-10: a stale cached read showed Bryce's booking with no event on every
// run, so each 15-minute run created ANOTHER event and Mark's reminders fired
// over and over. Creation now asks the calendar first.
// ---------------------------------------------------------------------------
describe('one event per booking, no matter what the database says', () => {
  const tagged = (id: string, created: string) => ({ id, status: 'confirmed', created })
  const goodTimes = {
    data: { status: 'confirmed', start: { dateTime: '2026-10-10T23:30:00-04:00' }, end: { dateTime: '2026-10-11T01:30:00-04:00' } },
  }

  it('stale "no event" read: reuses the event already on the calendar instead of creating another', async () => {
    api.list.mockResolvedValue({ data: { items: [tagged('evt_first', '2026-10-11T02:45:00Z')] } })
    for (let run = 0; run < 4; run++) {
      expect(await ensureBookingCalendarEvent(null, BRYCE)).toEqual({ action: 'adopted', eventId: 'evt_first', duplicatesRemoved: 0 })
    }
    expect(api.insert).not.toHaveBeenCalled()
    expect(api.list.mock.calls[0][0].privateExtendedProperty).toEqual(['booking_id=MC-BRYCE1010'])
  })

  it("cleans up tonight's duplicates: keeps the linked event, deletes the 4 extras silently", async () => {
    api.list.mockResolvedValue({
      data: {
        items: [
          tagged('evt_2300', '2026-10-11T03:00:00Z'),
          tagged('evt_linked', '2026-10-11T02:45:00Z'),
          tagged('evt_2315', '2026-10-11T03:15:00Z'),
          tagged('evt_2330', '2026-10-11T03:30:00Z'),
          tagged('evt_2345', '2026-10-11T03:45:00Z'),
        ],
      },
    })
    api.get.mockResolvedValue(goodTimes)
    expect(await ensureBookingCalendarEvent('evt_linked', BRYCE)).toEqual({ action: 'ok', eventId: 'evt_linked', duplicatesRemoved: 4 })
    expect(api.del.mock.calls.map((c) => c[0].eventId).sort()).toEqual(['evt_2300', 'evt_2315', 'evt_2330', 'evt_2345'])
    for (const c of api.del.mock.calls) expect(c[0].sendUpdates).toBe('none')
    expect(api.insert).not.toHaveBeenCalled()
  })

  it('no linked id and several tagged: keeps the OLDEST, deletes the rest', async () => {
    api.list.mockResolvedValue({ data: { items: [tagged('newer', '2026-10-11T03:00:00Z'), tagged('oldest', '2026-10-11T02:45:00Z')] } })
    expect(await ensureBookingCalendarEvent(null, BRYCE)).toEqual({ action: 'adopted', eventId: 'oldest', duplicatesRemoved: 1 })
    expect(api.del.mock.calls[0][0].eventId).toBe('newer')
  })

  it('never deletes anything when the linked event is not among the tagged ones', async () => {
    api.list.mockResolvedValue({ data: { items: [tagged('someone_elses_tag', '2026-10-11T02:00:00Z')] } })
    api.get.mockResolvedValue(goodTimes)
    await ensureBookingCalendarEvent('evt_linked', BRYCE)
    expect(api.del).not.toHaveBeenCalled()
  })
})
