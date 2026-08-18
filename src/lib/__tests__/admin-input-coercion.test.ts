import { describe, it, expect } from 'vitest'
import { isValidDuration } from '../pricing'

// Mirrors the coercion helpers in src/app/api/admin/bookings/invite/route.ts.
// These exist because the route previously used an `asUnit` helper that only
// accepted 1 | 2 | 3 and silently fell back to 1 — so an admin entering 6
// racers (or a 1.5-hour session) got a 1-racer, 1-hour booking with no error.
function asDuration(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return isValidDuration(n) ? n : fallback
}
function asRacerCount(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? Math.floor(v) : NaN
  return Number.isInteger(n) && n >= 1 ? n : fallback
}

describe('admin booking input coercion', () => {
  it('keeps a big group instead of collapsing it to 1', () => {
    expect(asRacerCount(6, 1)).toBe(6)
    expect(asRacerCount('6', 1)).toBe(6) // forms submit strings
    expect(asRacerCount(12, 1)).toBe(12)
  })

  it('still falls back for junk input', () => {
    expect(asRacerCount(0, 1)).toBe(1)
    expect(asRacerCount(-3, 1)).toBe(1)
    expect(asRacerCount('abc', 1)).toBe(1)
    expect(asRacerCount(undefined, 1)).toBe(1)
  })

  it('keeps half-hour and long durations instead of collapsing them to 1', () => {
    expect(asDuration(1.5, 1)).toBe(1.5)
    expect(asDuration('1.5', 1)).toBe(1.5)
    expect(asDuration(2.5, 1)).toBe(2.5)
    expect(asDuration(8, 1)).toBe(8)
  })

  it('rejects durations that are not on a half-hour step or out of range', () => {
    expect(asDuration(1.25, 1)).toBe(1)
    expect(asDuration(0.5, 1)).toBe(1)
    expect(asDuration(99, 1)).toBe(1)
  })
})
