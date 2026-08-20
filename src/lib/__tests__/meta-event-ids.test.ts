// Dedupe keys for the dual-fired conversions.
//
// Now that the browser Schedule actually fires (it used to lose a race with the
// Stripe webhook and silently no-op), the risk has flipped from UNDER-counting
// to DOUBLE-counting. Meta collapses a browser/server pair only when both carry
// the same (event_name, event_id) — so a drift between the two halves would
// double every booking in Ads Manager while our own reconciliation still looked
// perfectly healthy.
//
// These functions are the single source both halves call. The tests pin the
// properties that make them safe to dedupe on.
import { describe, it, expect } from 'vitest'
import {
  scheduleEventId,
  initiateCheckoutEventId,
  addPaymentInfoEventId,
} from '../meta/event-ids'

const BUILDERS = [
  { name: 'Schedule', fn: scheduleEventId },
  { name: 'InitiateCheckout', fn: initiateCheckoutEventId },
  { name: 'AddPaymentInfo', fn: addPaymentInfoEventId },
]

describe('event id builders', () => {
  it('are deterministic — the same booking always yields the same id', () => {
    // A refresh, a Stripe webhook redelivery, or a form retry must reproduce
    // the id rather than mint a new conversion.
    for (const { name, fn } of BUILDERS) {
      expect(fn('MC-COLE0820'), name).toBe(fn('MC-COLE0820'))
    }
  })

  it('distinguish different bookings', () => {
    for (const { name, fn } of BUILDERS) {
      expect(fn('MC-COLE0820'), name).not.toBe(fn('MC-COLE0821'))
    }
  })

  it('never collide across funnel steps for one booking', () => {
    // Same booking, three steps — three distinct ids, or Meta would dedupe
    // InitiateCheckout against Schedule and swallow a conversion.
    const ids = BUILDERS.map((b) => b.fn('MC-COLE0820'))
    expect(new Set(ids).size).toBe(BUILDERS.length)
  })

  it('carry the booking id, so an event can be traced back to a row', () => {
    for (const { name, fn } of BUILDERS) {
      expect(fn('MC-COLE0820'), name).toContain('MC-COLE0820')
    }
  })

  it('contain no timestamp or randomness', () => {
    // Guards against someone "improving" these with Date.now() or randomUUID,
    // which would break dedupe on every retry.
    const first = BUILDERS.map((b) => b.fn('MC-COLE0820'))
    const second = BUILDERS.map((b) => b.fn('MC-COLE0820'))
    expect(first).toEqual(second)
    for (const id of first) {
      expect(id).toMatch(/^[a-z]+_MC-COLE0820$/)
    }
  })
})
