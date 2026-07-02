import { describe, it, expect } from 'vitest'
import { computeDepositCents, isPartyType, partyTypeLabel } from '../parties-shared'
import { addDaysEastern, startOfWeekEastern } from '../dashboard-metrics'
import { isContactReason, contactReasonLabel, EVENT_REASONS } from '../contact'

describe('party deposit (50%, rounded)', () => {
  it('halves and rounds', () => {
    expect(computeDepositCents(45000)).toBe(22500)
    expect(computeDepositCents(9999)).toBe(5000) // 4999.5 → 5000
    expect(computeDepositCents(10001)).toBe(5001)
    expect(computeDepositCents(13500)).toBe(6750)
  })
})

describe('party types', () => {
  it('validates known types', () => {
    expect(isPartyType('birthday')).toBe(true)
    expect(isPartyType('corporate')).toBe(true)
    expect(isPartyType('general')).toBe(true)
    expect(isPartyType('wedding')).toBe(false)
  })
  it('labels', () => {
    expect(partyTypeLabel('birthday')).toMatch(/birthday/i)
    expect(partyTypeLabel('unknown')).toBe('unknown')
  })
  it('EVENT_REASONS covers birthday/corporate/large_group', () => {
    expect(EVENT_REASONS.has('birthday')).toBe(true)
    expect(EVENT_REASONS.has('corporate')).toBe(true)
    expect(EVENT_REASONS.has('large_group')).toBe(true)
  })
})

describe('Eastern date math (dashboard)', () => {
  it('addDaysEastern subtracts across a month boundary', () => {
    expect(addDaysEastern('2026-07-02', -13)).toBe('2026-06-19')
    expect(addDaysEastern('2026-07-02', -29)).toBe('2026-06-03')
    expect(addDaysEastern('2026-07-31', 1)).toBe('2026-08-01')
  })
  it('startOfWeekEastern returns the Monday of the week (Mon–Sun)', () => {
    // 2026-07-02 = Thursday → Monday 2026-06-29
    expect(startOfWeekEastern('2026-07-02')).toBe('2026-06-29')
    // A Monday maps to itself
    expect(startOfWeekEastern('2026-06-29')).toBe('2026-06-29')
    // A Sunday belongs to the week that started the prior Monday
    expect(startOfWeekEastern('2026-07-05')).toBe('2026-06-29')
  })
})

describe('contact reasons', () => {
  it('validates + labels', () => {
    expect(isContactReason('birthday')).toBe(true)
    expect(isContactReason('nope')).toBe(false)
    expect(contactReasonLabel('large_group')).toMatch(/large group/i)
  })
})
