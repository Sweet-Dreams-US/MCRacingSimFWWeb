import { describe, it, expect } from 'vitest'
import { parseLapTimeMs, formatLapTime } from '../laptime'

describe('parseLapTimeMs', () => {
  it('parses M:SS.fff', () => {
    expect(parseLapTimeMs('1:23.456')).toBe(83_456)
  })
  it('parses M:SS with no fraction', () => {
    expect(parseLapTimeMs('1:23')).toBe(83_000)
  })
  it('parses bare seconds over a minute', () => {
    expect(parseLapTimeMs('83.456')).toBe(83_456)
  })
  it('parses bare seconds under a minute', () => {
    expect(parseLapTimeMs('58.2')).toBe(58_200) // one-digit fraction = tenths
  })
  it('pads fractional millis correctly', () => {
    expect(parseLapTimeMs('58.23')).toBe(58_230)
    expect(parseLapTimeMs('58.230')).toBe(58_230)
  })
  it('accepts a comma decimal mark', () => {
    expect(parseLapTimeMs('1:02,050')).toBe(62_050)
  })
  it('rejects seconds >= 60 when minutes are present', () => {
    expect(parseLapTimeMs('1:83.4')).toBeNull()
  })
  it('rejects junk and empty', () => {
    expect(parseLapTimeMs('')).toBeNull()
    expect(parseLapTimeMs('fast')).toBeNull()
    expect(parseLapTimeMs('1:2:3')).toBeNull()
    expect(parseLapTimeMs('0')).toBeNull() // a zero time is not valid
  })
})

describe('formatLapTime', () => {
  it('formats sub-minute without a minutes field', () => {
    expect(formatLapTime(58_223)).toBe('58.223')
  })
  it('formats over a minute with padded seconds', () => {
    expect(formatLapTime(83_456)).toBe('1:23.456')
    expect(formatLapTime(62_050)).toBe('1:02.050')
  })
  it('pads millis', () => {
    expect(formatLapTime(83_000)).toBe('1:23.000')
  })
  it('guards against bad input', () => {
    expect(formatLapTime(0)).toBe('—')
    expect(formatLapTime(-5)).toBe('—')
  })
  it('round-trips with the parser', () => {
    for (const t of ['1:23.456', '58.223', '2:05.900']) {
      expect(formatLapTime(parseLapTimeMs(t) as number)).toBe(t)
    }
  })
})
