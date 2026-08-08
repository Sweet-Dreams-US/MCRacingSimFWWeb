import { describe, it, expect } from 'vitest'
import {
  isWeekend,
  isMonday,
  getDayType,
  calculatePrice,
  calculateNoShowFeeCents,
  NO_SHOW_FEE_CENTS_PER_SEAT,
  extraRacers,
  extraRacerChargeDollars,
  SIM_COUNT,
  EXTRA_RACER_RATE_PER_HOUR,
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

  it('caps at the sim count — a no-show only ever costs the 3 rigs', () => {
    expect(calculateNoShowFeeCents(4)).toBe(6000)
    expect(calculateNoShowFeeCents(8)).toBe(6000)
  })
})

describe('groups larger than the sims', () => {
  const THU = '2026-07-02' // weekday: 3 racers = 130 (1h) / 245 (2h)
  const SAT = '2026-07-04' // weekend: 3 racers = 140 (1h) / 275 (2h)

  it('counts only the racers past the sims as extras', () => {
    expect(extraRacers(3)).toBe(0)
    expect(extraRacers(4)).toBe(1)
    expect(extraRacers(7)).toBe(4)
  })

  it('charges the flat add-on per extra racer per hour', () => {
    expect(extraRacerChargeDollars(3, 2)).toBe(0)
    expect(extraRacerChargeDollars(4, 1)).toBe(EXTRA_RACER_RATE_PER_HOUR)
    // 2 extras over 3 hours
    expect(extraRacerChargeDollars(5, 3)).toBe(2 * EXTRA_RACER_RATE_PER_HOUR * 3)
  })

  it('adds the extras on top of the full 3-racer rate (weekday)', () => {
    expect(calculatePrice(THU, 1, 4).price).toBe(130 + 10)
    expect(calculatePrice(THU, 2, 5).price).toBe(245 + 2 * 10 * 2)
  })

  it('adds the extras on top of the full 3-racer rate (weekend)', () => {
    expect(calculatePrice(SAT, 1, 6).price).toBe(140 + 3 * 10)
    expect(calculatePrice(SAT, 2, 4).price).toBe(275 + 1 * 10 * 2)
  })

  it('leaves 1–3 racers priced exactly as before', () => {
    expect(calculatePrice(THU, 1, 3).price).toBe(130)
    expect(calculatePrice(SAT, 2, 2).price).toBe(180)
    expect(SIM_COUNT).toBe(3)
  })
})
