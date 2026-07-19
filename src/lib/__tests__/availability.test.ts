import { describe, it, expect } from 'vitest'
import {
  toExtendedMinutes,
  isSlotBlocked,
  isWholeDayBlocked,
  maxConcurrentRacers,
  seatsAvailableFor,
  windowsConflict,
  blockConflictsWithBooking,
  type AvailabilityBlockWindow,
  type SeatBooking,
} from '../availability'

describe('windowsConflict (no overlapping blocks)', () => {
  const w = (startTime: string | null, endTime: string | null): AvailabilityBlockWindow => ({ startTime, endTime })

  it('overlapping timed windows conflict', () => {
    // The real 2026-07-19 bug: 1:30–3:30 vs the existing 2:00–3:00 block.
    expect(windowsConflict(w('13:30', '15:30'), w('14:00', '15:00'))).toBe(true)
  })
  it('touching-but-not-overlapping windows do NOT conflict (half-open)', () => {
    expect(windowsConflict(w('12:00', '13:00'), w('13:00', '14:00'))).toBe(false)
  })
  it('disjoint windows do not conflict', () => {
    expect(windowsConflict(w('12:00', '13:00'), w('15:30', '16:30'))).toBe(false)
  })
  it('a whole-day window conflicts with anything (either side)', () => {
    expect(windowsConflict(w(null, null), w('14:00', '15:00'))).toBe(true)
    expect(windowsConflict(w('14:00', '15:00'), w(null, null))).toBe(true)
    expect(windowsConflict(w(null, null), w(null, null))).toBe(true)
  })
  it('past-midnight windows conflict via extended minutes', () => {
    // 11pm–1am vs 12am–1am overlap.
    expect(windowsConflict(w('23:00', '01:00'), w('00:00', '01:00'))).toBe(true)
  })
})

describe('blockConflictsWithBooking', () => {
  const w = (startTime: string | null, endTime: string | null): AvailabilityBlockWindow => ({ startTime, endTime })
  const bk = (startTime: string, durationHours: number): SeatBooking => ({ startTime, durationHours, racerCount: 2 })

  it('the 07-19 case: a 1:30–3:30 block overlaps Mark Crosby 1–2pm', () => {
    expect(blockConflictsWithBooking(w('13:30', '15:30'), bk('13:00', 1))).toBe(true)
  })
  it('a block that starts exactly when a booking ends does NOT conflict', () => {
    expect(blockConflictsWithBooking(w('14:00', '15:00'), bk('13:00', 1))).toBe(false)
  })
  it('a whole-day block covers every booking', () => {
    expect(blockConflictsWithBooking(w(null, null), bk('18:00', 1))).toBe(true)
  })
  it('a non-overlapping block leaves a booking alone', () => {
    expect(blockConflictsWithBooking(w('16:00', '17:00'), bk('13:00', 1))).toBe(false)
  })
})

// The venue runs noon -> 2am. Availability math uses "extended minutes":
// hours before noon belong to the same session date's late-night tail (+24h).

describe('toExtendedMinutes', () => {
  it('leaves noon-and-later times on the same day', () => {
    expect(toExtendedMinutes('12:00')).toBe(720)
    expect(toExtendedMinutes('18:30')).toBe(1110)
    expect(toExtendedMinutes('23:30')).toBe(1410)
  })
  it('pushes pre-noon times into the late-night tail (+24h)', () => {
    expect(toExtendedMinutes('00:00')).toBe(1440)
    expect(toExtendedMinutes('01:30')).toBe(1530)
    expect(toExtendedMinutes('02:00')).toBe(1560)
  })
  it('accepts Postgres TIME "HH:MM:SS" values', () => {
    expect(toExtendedMinutes('14:00:00')).toBe(840)
    expect(toExtendedMinutes('01:00:00')).toBe(1500)
  })
})

describe('isSlotBlocked', () => {
  const block = (startTime: string | null, endTime: string | null): AvailabilityBlockWindow => ({
    startTime,
    endTime,
  })

  it('blocks a session starting inside the window', () => {
    expect(isSlotBlocked([block('14:00', '16:00')], '15:00', 1)).toBe(true)
  })
  it('blocks a session that starts before but runs into the window', () => {
    expect(isSlotBlocked([block('14:00', '16:00')], '13:00', 2)).toBe(true)
    expect(isSlotBlocked([block('14:00', '16:00')], '13:30', 1)).toBe(true)
  })
  it('allows a session that ends exactly when the block starts', () => {
    expect(isSlotBlocked([block('14:00', '16:00')], '13:00', 1)).toBe(false)
    expect(isSlotBlocked([block('14:00', '16:00')], '12:00', 2)).toBe(false)
  })
  it('allows a session that starts exactly when the block ends', () => {
    expect(isSlotBlocked([block('14:00', '16:00')], '16:00', 2)).toBe(false)
  })
  it('handles blocks spanning midnight (23:00 -> 01:00)', () => {
    expect(isSlotBlocked([block('23:00', '01:00')], '23:30', 1)).toBe(true)
    expect(isSlotBlocked([block('23:00', '01:00')], '00:30', 1)).toBe(true)
    // 10 PM 1h session ends 11 PM exactly as the block starts -> allowed
    expect(isSlotBlocked([block('23:00', '01:00')], '22:00', 1)).toBe(false)
    // ...but a 2h session from 10 PM runs into it
    expect(isSlotBlocked([block('23:00', '01:00')], '22:00', 2)).toBe(true)
    // 1 AM start is exactly the block end -> allowed
    expect(isSlotBlocked([block('23:00', '01:00')], '01:00', 1)).toBe(false)
  })
  it('handles late-night-only blocks (00:00 -> 02:00)', () => {
    expect(isSlotBlocked([block('00:00', '02:00')], '01:00', 1)).toBe(true)
    // an 11 PM 2h session (ends 1 AM) overlaps
    expect(isSlotBlocked([block('00:00', '02:00')], '23:00', 2)).toBe(true)
    // an 11 PM 1h session ends exactly at midnight -> allowed
    expect(isSlotBlocked([block('00:00', '02:00')], '23:00', 1)).toBe(false)
  })
  it('whole-day blocks (null times) block everything', () => {
    expect(isSlotBlocked([block(null, null)], '12:00', 1)).toBe(true)
    expect(isSlotBlocked([block(null, null)], '01:30', 3)).toBe(true)
  })
  it('checks every block in the list', () => {
    const blocks = [block('12:00', '13:00'), block('20:00', '22:00')]
    expect(isSlotBlocked(blocks, '20:30', 1)).toBe(true)
    expect(isSlotBlocked(blocks, '15:00', 1)).toBe(false)
  })
  it('no blocks -> nothing blocked', () => {
    expect(isSlotBlocked([], '12:00', 3)).toBe(false)
  })
})

describe('isWholeDayBlocked', () => {
  it('true only when a null-times block exists', () => {
    expect(isWholeDayBlocked([{ startTime: null, endTime: null }])).toBe(true)
    expect(isWholeDayBlocked([{ startTime: '12:00', endTime: '14:00' }])).toBe(false)
    expect(isWholeDayBlocked([])).toBe(false)
  })
})

describe('seat capacity (3 seats)', () => {
  const b = (startTime: string, durationHours: number, racerCount: number): SeatBooking => ({
    startTime,
    durationHours,
    racerCount,
  })

  it('empty venue: any racers fit', () => {
    expect(maxConcurrentRacers([], '18:00', 2)).toBe(0)
    expect(seatsAvailableFor([], '18:00', 2, 3, 3)).toBe(true)
  })

  it('a 1-seat booking still leaves 2 seats at the same time', () => {
    const existing = [b('18:00', 2, 1)]
    expect(maxConcurrentRacers(existing, '18:00', 2)).toBe(1)
    expect(seatsAvailableFor(existing, '18:00', 2, 2, 3)).toBe(true) // 1 + 2 = 3 fits
    expect(seatsAvailableFor(existing, '18:00', 2, 3, 3)).toBe(false) // 1 + 3 = 4 > 3
  })

  it('overlapping bookings sum only where they actually overlap', () => {
    // 6-7pm: 2 racers; 7-9pm: 1 racer.
    const existing = [b('18:00', 1, 2), b('19:00', 2, 1)]
    // New 6-8pm booking: peak is 2 (6-7 with the first) — the 7-9 booking (1)
    // overlaps 7-8 → at 7:00 occupancy = 1 (first ended). Peak stays 2.
    expect(maxConcurrentRacers(existing, '18:00', 2)).toBe(2)
    expect(seatsAvailableFor(existing, '18:00', 2, 1, 3)).toBe(true) // 2 + 1 = 3
    expect(seatsAvailableFor(existing, '18:00', 2, 2, 3)).toBe(false) // 2 + 2 = 4
  })

  it('full slot (3 seats already) blocks any new racers', () => {
    const existing = [b('20:00', 2, 3)]
    expect(seatsAvailableFor(existing, '20:00', 1, 1, 3)).toBe(false)
    expect(seatsAvailableFor(existing, '21:00', 1, 1, 3)).toBe(false) // still inside 8-10
    expect(seatsAvailableFor(existing, '22:00', 1, 1, 3)).toBe(true) // after it ends
  })

  it('non-overlapping times are independent', () => {
    const existing = [b('18:00', 1, 3)] // 6-7pm full
    expect(seatsAvailableFor(existing, '19:00', 1, 3, 3)).toBe(true) // 7-8pm free
  })

  it('late-night overlap (past midnight) via extended minutes', () => {
    // 11pm 2h = 11pm-1am, holds 2 seats. New 12am(=00:00) 1h = 12-1am overlaps.
    const existing = [b('23:00', 2, 2)]
    expect(maxConcurrentRacers(existing, '00:00', 1)).toBe(2)
    expect(seatsAvailableFor(existing, '00:00', 1, 1, 3)).toBe(true)
    expect(seatsAvailableFor(existing, '00:00', 1, 2, 3)).toBe(false)
  })
})
