import { describe, it, expect } from 'vitest'
import {
  toExtendedMinutes,
  isSlotBlocked,
  isWholeDayBlocked,
  type AvailabilityBlockWindow,
} from '../availability'

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
