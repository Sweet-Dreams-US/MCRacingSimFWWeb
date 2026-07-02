import { describe, it, expect } from 'vitest'
import {
  isWeekend,
  isMonday,
  getDayType,
  calculatePrice,
  calculateNoShowFeeCents,
  NO_SHOW_FEE_CENTS_PER_SEAT,
} from '../pricing'

// Reference dates (noon-anchored so weekday is unambiguous):
// 2026-07-02 = Thursday, 2026-07-03 = Friday, 2026-07-04 = Saturday,
// 2026-07-05 = Sunday, 2026-07-06 = Monday, 2026-07-07 = Tuesday.

describe('day classification', () => {
  it('treats Fri/Sat/Sun as weekend', () => {
    expect(isWeekend('2026-07-03')).toBe(true) // Fri
    expect(isWeekend('2026-07-04')).toBe(true) // Sat
    expect(isWeekend('2026-07-05')).toBe(true) // Sun
  })
  it('treats Tue–Thu as weekday', () => {
    expect(isWeekend('2026-07-02')).toBe(false) // Thu
    expect(isWeekend('2026-07-07')).toBe(false) // Tue
  })
  it('detects Monday', () => {
    expect(isMonday('2026-07-06')).toBe(true)
    expect(isMonday('2026-07-07')).toBe(false)
  })
  it('getDayType: Monday closed, others weekday/weekend', () => {
    expect(getDayType('2026-07-06')).toBe('closed') // Mon
    expect(getDayType('2026-07-04')).toBe('weekend') // Sat
    expect(getDayType('2026-07-02')).toBe('weekday') // Thu
  })
})

describe('calculatePrice matrix (dollars)', () => {
  it('weekday tiers', () => {
    expect(calculatePrice('2026-07-02', 1, 1).price).toBe(45)
    expect(calculatePrice('2026-07-02', 3, 1).price).toBe(115)
    expect(calculatePrice('2026-07-02', 1, 3).price).toBe(130)
    expect(calculatePrice('2026-07-02', 3, 3).price).toBe(340)
  })
  it('weekend tiers are higher', () => {
    expect(calculatePrice('2026-07-04', 1, 1).price).toBe(50)
    expect(calculatePrice('2026-07-04', 3, 3).price).toBe(365)
    // Same slot costs more on a weekend.
    expect(calculatePrice('2026-07-04', 2, 2).price).toBeGreaterThan(
      calculatePrice('2026-07-02', 2, 2).price
    )
  })
  it('reports the weekend flag', () => {
    expect(calculatePrice('2026-07-04', 1, 1).isWeekend).toBe(true)
    expect(calculatePrice('2026-07-02', 1, 1).isWeekend).toBe(false)
  })
})

describe('no-show fee', () => {
  it('is $20 per seat', () => {
    expect(NO_SHOW_FEE_CENTS_PER_SEAT).toBe(2000)
    expect(calculateNoShowFeeCents(1)).toBe(2000)
    expect(calculateNoShowFeeCents(3)).toBe(6000)
  })
})
