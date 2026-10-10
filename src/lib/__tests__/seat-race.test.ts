import { describe, it, expect, beforeEach, vi } from 'vitest'
// vi.mock calls below are hoisted above this import by Vitest.
import { checkSeatsBeforeCardSave, finalizeConfirmedBooking, SLOT_TAKEN_MESSAGE } from '../booking'

// The 2026-10-10 double booking: Bethany and Andrew each booked 2 racers at
// 5pm (3 rigs). Both started checkout while the other was still typing a card,
// and nothing re-checked when the cards went through. Rule now: whoever's card
// saves first gets the seats; the other is stopped.

// ---------------------------------------------------------------------------
// In-memory stand-in for the Supabase admin client
// ---------------------------------------------------------------------------
interface Row {
  id: string
  status: string
  source: string
  session_date: string
  start_time: string
  duration_hours: number
  racer_count: number
  customer_id: string | null
  notes: string | null
  google_calendar_event_id: string | null
  [k: string]: unknown
}

// Mocks that vi.mock factories return directly must exist before the hoisted
// factories run.
const { sendBookingEmails, createBookingCalendarEvent, sendMetaEvent } = vi.hoisted(() => ({
  sendBookingEmails: vi.fn(async (_id: string) => ({ sent: 1, skipped: 0, failed: 0 })),
  createBookingCalendarEvent: vi.fn(async (_p: unknown) => 'cal_1'),
  sendMetaEvent: vi.fn(async (_p: unknown) => undefined),
}))

const db = {
  bookings: [] as Row[],
  rpcResult: { data: 'confirmed' as unknown, error: null as null | { message: string } },
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }>,
}

function query(table: string) {
  const filters: Record<string, unknown> = {}
  let inFilter: { col: string; vals: unknown[] } | null = null
  let patch: Record<string, unknown> | null = null
  const matches = () =>
    (table === 'bookings' ? db.bookings : []).filter(
      (r) =>
        Object.entries(filters).every(([k, v]) => r[k] === v) &&
        (!inFilter || inFilter.vals.includes(r[inFilter.col]))
    )
  const b: Record<string, unknown> = {}
  b.select = () => {
    if (patch) {
      const hit = matches()
      db.updates.push({ patch, filters: { ...filters } })
      for (const r of hit) Object.assign(r, patch)
      return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
    }
    return b
  }
  b.eq = (k: string, v: unknown) => ((filters[k] = v), b)
  b.in = (col: string, vals: unknown[]) => ((inFilter = { col, vals }), b)
  b.update = (p: Record<string, unknown>) => ((patch = p), b)
  b.maybeSingle = () => {
    const r = matches()[0]
    return Promise.resolve({
      data: r ? { ...r, customer: { first_name: 'Andrew', last_name: 'Rice', email: 'a@example.com', phone: '2605550000' } } : null,
      error: null,
    })
  }
  b.then = (resolve: (v: unknown) => unknown) => {
    if (patch) {
      const hit = matches()
      db.updates.push({ patch, filters: { ...filters } })
      for (const r of hit) Object.assign(r, patch)
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return Promise.resolve({ data: matches(), error: null }).then(resolve)
  }
  return b
}

vi.mock('../supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => query(t),
    rpc: (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args })
      return Promise.resolve(db.rpcResult)
    },
  }),
}))

const sentEmails: Array<{ to: string; template: string; subject: string }> = []
vi.mock('../email', () => ({
  sendEmail: vi.fn(async (p: { to: string; template: string; subject: string }) => {
    sentEmails.push({ to: p.to, template: p.template, subject: p.subject })
    return 'msg_1'
  }),
  getOwnerNotificationEmail: () => 'owner@example.com',
}))
vi.mock('../emails/send-booking-emails', () => ({ sendBookingEmails }))
vi.mock('../calendar', () => ({
  createBookingCalendarEvent,
  resyncBookingCalendarEvent: vi.fn(),
  deleteBookingCalendarEvent: vi.fn(),
}))
vi.mock('../meta/capi', () => ({ sendMetaEvent, resolveFbc: () => null }))
vi.mock('../mc-bookings', () => ({ recordMcBooking: vi.fn(async () => undefined) }))
vi.mock('../stripe', () => ({ getStripe: () => ({}) }))


function booking(over: Partial<Row>): Row {
  return {
    id: 'X',
    status: 'pending',
    source: 'online',
    session_date: '2026-10-10',
    start_time: '17:00:00',
    duration_hours: 1,
    racer_count: 2,
    customer_id: 'cust-1',
    notes: null,
    google_calendar_event_id: null,
    session_price_cents: 10000,
    no_show_fee_cents: 4000,
    discount_code: null,
    discount_amount_cents: 0,
    ...over,
  }
}

beforeEach(() => {
  db.bookings = []
  db.rpcResult = { data: 'confirmed', error: null }
  db.rpcCalls = []
  db.updates = []
  sentEmails.length = 0
  vi.clearAllMocks()
  delete process.env.SEAT_CAPACITY
})

describe('checkSeatsBeforeCardSave (runs when "Save Card" is pressed)', () => {
  it("stops Andrew's card: Bethany's 2 racers confirmed first, only 1 rig left", async () => {
    db.bookings = [
      booking({ id: 'MC-WALKIN1010', source: 'admin', status: 'confirmed', start_time: '15:00:00', duration_hours: 2, racer_count: 4 }),
      booking({ id: 'MC-BETHANY1010', status: 'confirmed' }),
      booking({ id: 'MC-ANDREW1010-2' }),
    ]
    expect(await checkSeatsBeforeCardSave('MC-ANDREW1010-2')).toEqual({
      ok: false,
      reason: 'full',
      message: SLOT_TAKEN_MESSAGE,
    })
  })

  it('lets the card through when the slot still has room', async () => {
    db.bookings = [booking({ id: 'MC-BETHANY1010', status: 'confirmed', racer_count: 1 }), booking({ id: 'ME' })]
    expect(await checkSeatsBeforeCardSave('ME')).toEqual({ ok: true })
  })

  it('does not count other people who are still typing their card (no holds)', async () => {
    db.bookings = [booking({ id: 'OTHER', status: 'pending', racer_count: 3 }), booking({ id: 'ME' })]
    expect(await checkSeatsBeforeCardSave('ME')).toEqual({ ok: true })
  })

  it('does not count my own booking against me', async () => {
    db.bookings = [booking({ id: 'ME', racer_count: 3 })]
    expect(await checkSeatsBeforeCardSave('ME')).toEqual({ ok: true })
  })

  it('never blocks a staff-created booking', async () => {
    db.bookings = [booking({ id: 'FULL', status: 'confirmed', racer_count: 3 }), booking({ id: 'STAFF', source: 'admin' })]
    expect(await checkSeatsBeforeCardSave('STAFF')).toEqual({ ok: true })
  })

  it('reports missing and no-longer-pending bookings', async () => {
    db.bookings = [booking({ id: 'GONE', status: 'cancelled' })]
    expect((await checkSeatsBeforeCardSave('GONE')).ok).toBe(false)
    expect(await checkSeatsBeforeCardSave('NOPE')).toMatchObject({ ok: false, reason: 'not_found' })
  })
})

describe('finalizeConfirmedBooking (runs when the card lands at Stripe)', () => {
  it('asks the database to confirm atomically, with the seat capacity', async () => {
    db.bookings = [booking({ id: 'ME' })]
    process.env.SEAT_CAPACITY = '3'
    await finalizeConfirmedBooking('ME')
    expect(db.rpcCalls).toEqual([
      { fn: 'confirm_booking_if_seats_free', args: { p_booking_id: 'ME', p_capacity: 3 } },
    ])
    expect(sendBookingEmails).toHaveBeenCalledWith('ME')
  })

  it('same-instant loser: cancels, emails customer + owner, no confirmation, no ad conversion', async () => {
    db.bookings = [booking({ id: 'LOSER' })]
    db.rpcResult = { data: 'full', error: null }
    await finalizeConfirmedBooking('LOSER')

    expect(db.bookings[0].status).toBe('cancelled')
    expect(db.bookings[0].notes).toMatch(/another booking's card saved first/)
    expect(sentEmails.map((e) => e.template).sort()).toEqual(['booking_slot_filled', 'owner_booking_slot_filled'])
    expect(sentEmails.find((e) => e.template === 'booking_slot_filled')!.to).toBe('a@example.com')
    expect(sendBookingEmails).not.toHaveBeenCalled()
    expect(createBookingCalendarEvent).not.toHaveBeenCalled()
    expect(sendMetaEvent).not.toHaveBeenCalled()
  })

  it('falls back to a plain confirm if the database gate errors, so bookings never get stuck', async () => {
    db.bookings = [booking({ id: 'ME' })]
    db.rpcResult = { data: null, error: { message: 'function does not exist' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await finalizeConfirmedBooking('ME')
    spy.mockRestore()
    expect(db.bookings[0].status).toBe('confirmed')
    expect(sendBookingEmails).toHaveBeenCalledWith('ME')
  })
})
