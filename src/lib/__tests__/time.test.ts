import { describe, it, expect } from 'vitest'
import { addHoursToTime } from '../time'
import { DURATION_OPTIONS, allDurationOptions } from '../pricing'

// Regression guard for the 2026-08-08 outage: half-hour session lengths shipped
// while end-time math still did `(hour + duration) % 24`, so a 1:00 PM booking
// for 1.5h produced "14.5:00" and Postgres rejected the row with
// `invalid input syntax for type time`. Every bookable duration must yield a
// value a TIME column will accept.

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

describe('addHoursToTime', () => {
  it('handles whole hours', () => {
    expect(addHoursToTime('13:00', 1)).toBe('14:00')
    expect(addHoursToTime('13:00', 3)).toBe('16:00')
  })

  it('handles half hours — the case that broke production', () => {
    expect(addHoursToTime('13:00', 1.5)).toBe('14:30')
    expect(addHoursToTime('13:00', 2.5)).toBe('15:30')
    expect(addHoursToTime('13:30', 1.5)).toBe('15:00')
  })

  it('carries minutes over the hour', () => {
    expect(addHoursToTime('13:45', 0.5)).toBe('14:15')
    expect(addHoursToTime('13:45', 1.5)).toBe('15:15')
  })

  it('wraps past midnight', () => {
    expect(addHoursToTime('23:00', 3)).toBe('02:00')
    expect(addHoursToTime('23:30', 1.5)).toBe('01:00')
    expect(addHoursToTime('12:00', 14)).toBe('02:00') // full day, noon → 2am close
  })

  it('accepts a Postgres TIME string ("HH:MM:SS")', () => {
    expect(addHoursToTime('13:00:00', 1.5)).toBe('14:30')
  })

  it('never emits a fractional or unpadded component', () => {
    for (const start of ['12:00', '13:30', '18:45', '23:00', '00:30']) {
      for (const d of allDurationOptions()) {
        const end = addHoursToTime(start, d)
        expect(end, `${start} + ${d}h -> ${end}`).toMatch(HHMM)
        expect(end).not.toContain('.')
      }
    }
  })

  it('covers every duration the UI actually offers', () => {
    for (const d of DURATION_OPTIONS) {
      expect(addHoursToTime('13:00', d)).toMatch(HHMM)
    }
  })

  it('rejects unparseable input rather than emitting a bad time', () => {
    expect(() => addHoursToTime('not-a-time', 1)).toThrow()
    expect(() => addHoursToTime('13:00', Number.NaN)).toThrow()
  })
})
