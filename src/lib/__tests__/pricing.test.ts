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
  isValidDuration,
  formatDuration,
  DURATION_OPTIONS,
  MAX_DURATION_HOURS,
  LONG_SESSION_RATE_PER_SEAT_HOUR,
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

describe('half-hour sessions', () => {
  const THU = '2026-07-02' // weekday: 1 racer 45/85/115, 3 racers 130/245/340
  const SAT = '2026-07-04' // weekend: 1 racer 50/95/135, 3 racers 140/275/365

  it('offers every half hour from 1 to 3', () => {
    expect(DURATION_OPTIONS).toEqual([1, 1.5, 2, 2.5, 3])
  })

  it('accepts any half-hour step from 1 hour up to a full day', () => {
    expect(isValidDuration(1)).toBe(true)
    expect(isValidDuration(1.5)).toBe(true)
    expect(isValidDuration(3)).toBe(true)
    expect(isValidDuration(8)).toBe(true) // long sessions are bookable now
    expect(isValidDuration(MAX_DURATION_HOURS)).toBe(true)
    expect(isValidDuration(1.25)).toBe(false) // quarter hour
    expect(isValidDuration(0.5)).toBe(false) // under the minimum
    expect(isValidDuration(MAX_DURATION_HOURS + 0.5)).toBe(false) // past close
    expect(isValidDuration(NaN)).toBe(false)
  })

  // A trailing half hour costs half the ONE-HOUR rate on top of the whole
  // hours. It must never interpolate toward the next tier — the 2h/3h prices
  // carry a bulk discount, and interpolating gave a 1.5h session part of a
  // discount it hasn't earned.
  it('prices a half hour at half the one-hour rate, not a midpoint', () => {
    // weekday 1 racer: 1h $45 -> 1.5h = 45 + 22.50 = $67.50 (midpoint was $65)
    expect(calculatePrice(THU, 1.5, 1).price).toBe(67.5)
    // weekday 1 racer: 2h $85 + half of 1h $45 -> 2.5h = $107.50 (was $100)
    expect(calculatePrice(THU, 2.5, 1).price).toBe(107.5)
    // weekday 3 racers: 1h $130 -> 1.5h = 130 + 65 = $195 (was $187.50)
    expect(calculatePrice(THU, 1.5, 3).price).toBe(195)
    // weekend 1 racer: 1h $50 -> 1.5h = $75 (was $72.50)
    expect(calculatePrice(SAT, 1.5, 1).price).toBe(75)
    // weekend 3 racers: 2h $275 + half of 1h $140 -> 2.5h = $345 (was $320)
    expect(calculatePrice(SAT, 2.5, 3).price).toBe(345)
  })

  it('never prices a half hour cheaper than the whole hour below it', () => {
    for (const date of [THU, SAT]) {
      for (const racers of [1, 2, 3] as const) {
        for (const [lo, half] of [[1, 1.5], [2, 2.5]] as const) {
          expect(calculatePrice(date, half as never, racers).price).toBeGreaterThan(
            calculatePrice(date, lo as never, racers).price
          )
        }
      }
    }
  })

  it('prorates the extra-racer add-on over a half hour', () => {
    // 1 extra racer x $10/hr x 1.5h = $15, on top of the 3-racer 1.5h rate ($195)
    expect(calculatePrice(THU, 1.5, 4).price).toBe(195 + 15)
    expect(extraRacerChargeDollars(4, 1.5)).toBe(15)
  })

  it('leaves whole hours priced exactly as before', () => {
    expect(calculatePrice(THU, 1, 1).price).toBe(45)
    expect(calculatePrice(THU, 2, 3).price).toBe(245)
    expect(calculatePrice(SAT, 3, 3).price).toBe(365)
  })

  it('labels durations for display', () => {
    expect(formatDuration(1)).toBe('1 hour')
    expect(formatDuration(1.5)).toBe('1.5 hours')
    expect(formatDuration(2)).toBe('2 hours')
  })
})

describe('sessions longer than the price matrix', () => {
  const THU = '2026-07-02' // weekday 3h: 1 racer $115, 2 racers $220, 3 racers $340
  const SAT = '2026-07-04' // weekend 3h: 3 racers $365

  it('bills each hour past 3 at the flat per-seat rate', () => {
    expect(LONG_SESSION_RATE_PER_SEAT_HOUR).toBe(30)
    // 1 racer, 8h = 3h matrix ($115) + 5 extra hours x $30 x 1 seat
    expect(calculatePrice(THU, 8, 1).price).toBe(115 + 5 * 30)
    // 2 racers, 8h = $220 + 5 x $30 x 2
    expect(calculatePrice(THU, 8, 2).price).toBe(220 + 5 * 30 * 2)
    // 3 racers, 8h = $340 + 5 x $30 x 3
    expect(calculatePrice(THU, 8, 3).price).toBe(340 + 5 * 30 * 3)
    // weekend keeps its own 3h base
    expect(calculatePrice(SAT, 8, 3).price).toBe(365 + 5 * 30 * 3)
  })

  it('handles a half-hour past the matrix', () => {
    expect(calculatePrice(THU, 3.5, 1).price).toBe(115 + 0.5 * 30)
  })

  it('charges oversized groups the cheap extra-racer rate, not the seat rate', () => {
    // 5 racers, 8h: 3h base $340 + 5h x $30 x 3 seats + 2 extras x $10 x 8h
    expect(calculatePrice(THU, 8, 5).price).toBe(340 + 5 * 30 * 3 + 2 * 10 * 8)
  })

  it('leaves WHOLE hours at or under 3 exactly as before', () => {
    expect(calculatePrice(THU, 3, 3).price).toBe(340)
    // Half hours are no longer midpoints: 2h $85 + half of 1h $45 = $107.50.
    expect(calculatePrice(THU, 2.5, 1).price).toBe(107.5)
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
