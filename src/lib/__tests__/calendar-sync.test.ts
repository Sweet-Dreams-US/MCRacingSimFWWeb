import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bookingWallClockWindow } from '../time'

const { ensureBookingCalendarEvent } = vi.hoisted(() => ({
  ensureBookingCalendarEvent: vi.fn(),
}))
vi.mock('../calendar', () => ({ ensureBookingCalendarEvent }))
import { syncBookingCalendar } from '../calendar-sync'

// ---------------------------------------------------------------------------
// Real dates. Bryce's 11:30pm-1:30am session on 2026-10-10 was never put on the
// calendar: its end was sent as 1:30am on Oct 10 — before it started — and
// Google rejected it.
// ---------------------------------------------------------------------------
describe('bookingWallClockWindow', () => {
  it('a session crossing midnight ends the next day (Bryce, Oct 10)', () => {
    expect(bookingWallClockWindow('2026-10-10', '23:30:00', 2)).toEqual({
      startDate: '2026-10-10',
      startTime: '23:30',
      endDate: '2026-10-11',
      endTime: '01:30',
    })
  })

  it('a post-midnight start belongs to the next calendar day (Bryce, 1am on the Oct 9 evening)', () => {
    expect(bookingWallClockWindow('2026-10-09', '01:00:00', 1.5)).toEqual({
      startDate: '2026-10-10',
      startTime: '01:00',
      endDate: '2026-10-10',
      endTime: '02:30',
    })
  })

  it('an ordinary evening session is unchanged', () => {
    expect(bookingWallClockWindow('2026-10-10', '17:00', 1)).toEqual({
      startDate: '2026-10-10',
      startTime: '17:00',
      endDate: '2026-10-10',
      endTime: '18:00',
    })
  })

  it('ending exactly at midnight lands on the next day at 00:00', () => {
    expect(bookingWallClockWindow('2026-10-10', '23:00', 1)).toMatchObject({ endDate: '2026-10-11', endTime: '00:00' })
  })

  it('end is always after start, for every half-hour start and length', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        for (let dur = 1; dur <= 14; dur += 0.5) {
          const start = `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
          const w = bookingWallClockWindow('2026-12-31', start, dur)
          const s = Date.parse(`${w.startDate}T${w.startTime}:00Z`)
          const e = Date.parse(`${w.endDate}T${w.endTime}:00Z`)
          expect(e - s).toBe(dur * 3600_000)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The 15-minute sweep
// ---------------------------------------------------------------------------
const NOW = new Date('2026-10-11T02:10:00Z') // 10:10pm Oct 10 in Fort Wayne

function fakeAdmin(rows: Array<Record<string, unknown>>) {
  const saved: Array<{ id: unknown; eventId: unknown }> = []
  const readFilters: Record<string, unknown> = {}
  const admin = {
    saved,
    readFilters,
    from() {
      let patch: Record<string, unknown> | null = null
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (k: string, v: unknown) => {
        if (patch && k === 'id') {
          saved.push({ id: v, eventId: patch.google_calendar_event_id })
          return Promise.resolve({ error: null })
        }
        readFilters[k] = v
        return b
      }
      b.gte = (k: string, v: unknown) => ((readFilters[`${k}>=`] = v), b)
      b.lte = (k: string, v: unknown) => ((readFilters[`${k}<=`] = v), b)
      b.order = () => b
      b.limit = () => Promise.resolve({ data: rows, error: null })
      b.update = (p: Record<string, unknown>) => ((patch = p), b)
      return b
    },
  }
  return admin
}

function row(over: Record<string, unknown>) {
  return {
    id: 'X',
    session_date: '2026-10-10',
    start_time: '23:30:00',
    duration_hours: '2.0',
    racer_count: 3,
    session_price_cents: 30000,
    no_show_fee_cents: 6000,
    source: 'online',
    google_calendar_event_id: null,
    created_at: '2026-10-11T00:56:09Z',
    updated_at: '2026-10-11T00:56:56Z',
    customer: { first_name: 'Bryce', last_name: 'M', email: 'b@example.com', phone: '2605550000' },
    ...over,
  }
}

beforeEach(() => ensureBookingCalendarEvent.mockReset())

describe('syncBookingCalendar', () => {
  it("puts Bryce's missing booking on the calendar and saves the event id", async () => {
    ensureBookingCalendarEvent.mockResolvedValue({ action: 'created', eventId: 'evt_new', reason: 'missing', duplicatesRemoved: 0 })
    const admin = fakeAdmin([row({ id: 'MC-BRYCE1010' })])
    const r = await syncBookingCalendar(admin as never, NOW)

    expect(r.created).toEqual(['MC-BRYCE1010'])
    expect(ensureBookingCalendarEvent).toHaveBeenCalledWith(null, expect.objectContaining({
      bookingId: 'MC-BRYCE1010',
      customerName: 'Bryce M',
      sessionDate: '2026-10-10',
      startTime: '23:30:00',
      durationHours: 2,
    }))
    expect(admin.saved).toEqual([{ id: 'MC-BRYCE1010', eventId: 'evt_new' }])
  })

  it('only looks at confirmed bookings from tonight onward', async () => {
    ensureBookingCalendarEvent.mockResolvedValue({ action: 'ok', eventId: 'e', duplicatesRemoved: 0 })
    const admin = fakeAdmin([])
    await syncBookingCalendar(admin as never, NOW)
    expect(admin.readFilters).toMatchObject({ status: 'confirmed', 'session_date>=': '2026-10-10' })
  })

  it('gives a booking created in the last few minutes time to get its own event', async () => {
    const admin = fakeAdmin([row({ id: 'JUST_NOW', updated_at: '2026-10-11T02:09:00Z' })])
    const r = await syncBookingCalendar(admin as never, NOW)
    expect(ensureBookingCalendarEvent).not.toHaveBeenCalled()
    expect(r.checked).toBe(0)
  })

  it('names a booking with no customer "Walk-in"', async () => {
    ensureBookingCalendarEvent.mockResolvedValue({ action: 'ok', eventId: 'e', duplicatesRemoved: 0 })
    await syncBookingCalendar(fakeAdmin([row({ id: 'HOLD', customer: null, google_calendar_event_id: 'e' })]) as never, NOW)
    expect(ensureBookingCalendarEvent.mock.calls[0][1].customerName).toBe('Walk-in')
  })

  it('one failure does not stop the rest, and is reported', async () => {
    ensureBookingCalendarEvent
      .mockRejectedValueOnce(new Error('Google 500'))
      .mockResolvedValueOnce({ action: 'retimed', eventId: 'e2', duplicatesRemoved: 0 })
    const r = await syncBookingCalendar(
      fakeAdmin([row({ id: 'A', google_calendar_event_id: 'e1' }), row({ id: 'B', google_calendar_event_id: 'e2' })]) as never,
      NOW
    )
    expect(r.failed).toEqual([{ bookingId: 'A', error: 'Google 500' }])
    expect(r.retimed).toEqual(['B'])
  })

  it('replaces the id of an event someone deleted in Google Calendar', async () => {
    ensureBookingCalendarEvent.mockResolvedValue({ action: 'created', eventId: 'evt_back', reason: 'deleted_in_calendar', duplicatesRemoved: 0 })
    const admin = fakeAdmin([row({ id: 'GONE', google_calendar_event_id: 'evt_old' })])
    const r = await syncBookingCalendar(admin as never, NOW)
    expect(r.recreated).toEqual(['GONE'])
    expect(admin.saved).toEqual([{ id: 'GONE', eventId: 'evt_back' }])
  })
})

describe('syncBookingCalendar — duplicates', () => {
  it('links an adopted event and reports removed duplicates', async () => {
    ensureBookingCalendarEvent.mockResolvedValue({ action: 'adopted', eventId: 'evt_first', duplicatesRemoved: 4 })
    const admin = fakeAdmin([row({ id: 'MC-BRYCE1010' })])
    const r = await syncBookingCalendar(admin as never, NOW)
    expect(r.adopted).toEqual(['MC-BRYCE1010'])
    expect(r.created).toEqual([])
    expect(r.duplicatesRemoved).toBe(4)
    expect(admin.saved).toEqual([{ id: 'MC-BRYCE1010', eventId: 'evt_first' }])
  })
})
