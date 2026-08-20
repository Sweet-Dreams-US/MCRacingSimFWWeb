// Round-2 campaign: prove a click on each live ad URL survives all the way to
// the values written on the booking row.
//
// utm_content carries the AD NAME. It is the only thing that tells us which
// creative produced a booking without asking Meta, so the whole first-party
// reporting story rests on it arriving intact. These tests walk the real chain:
//
//   ad URL -> captureAttribution() (browser, on landing)
//          -> getAttribution()     (browser, at submit)
//          -> sanitizeAttribution()(server, untrusted input)
//          -> the columns createBooking writes
//
// The exact URLs below are the ones pasted into Ads Manager. If an ad is
// renamed, update this list — a mismatch here is a mismatch in reporting.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  captureAttribution,
  getAttribution,
  sanitizeAttribution,
  deriveAttributedSource,
} from '../meta/attribution'

const SITE = 'https://www.mcracingfortwayne.com'
const CAMPAIGN = 'MCR_Bookings_2026-08'

const AD_NAMES = [
  'DateNight_Static_Blue',
  'Comparative_Static_Bowling',
  '3Activities_Video_A',
  'DoorReveal_Video_A',
]

const adUrl = (adName: string) =>
  `${SITE}/book?utm_source=meta&utm_medium=paid` +
  `&utm_campaign=${CAMPAIGN}&utm_content=${adName}`

/** Minimal browser: real document.cookie semantics + a localStorage stand-in. */
function makeBrowser(href: string) {
  const jar = new Map<string, string>()
  const store = new Map<string, string>()
  const url = new URL(href)
  const document = {
    get cookie() {
      return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(raw: string) {
      const [pair] = raw.split(';')
      const eq = pair.indexOf('=')
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    },
  }
  const window = {
    location: { search: url.search, href, hostname: url.hostname, protocol: url.protocol },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  return { window, document, jar, store }
}

let env: ReturnType<typeof makeBrowser>

function visit(href: string, carryFrom?: ReturnType<typeof makeBrowser>) {
  const next = makeBrowser(href)
  if (carryFrom) {
    carryFrom.jar.forEach((v, k) => next.jar.set(k, v))
    carryFrom.store.forEach((v, k) => next.store.set(k, v))
  }
  ;(globalThis as Record<string, unknown>).window = next.window
  ;(globalThis as Record<string, unknown>).document = next.document
  return next
}

/** Exactly what createBooking writes onto the row, given a submitted bundle. */
function bookingRowColumns(submitted: unknown) {
  const a = sanitizeAttribution(submitted) // server-side hardening
  return {
    fbp: a.fbp ?? null,
    fbc: a.fbc ?? null,
    fbclid: a.fbclid ?? null,
    utm_source: a.utmSource ?? null,
    utm_medium: a.utmMedium ?? null,
    utm_campaign: a.utmCampaign ?? null,
    utm_content: a.utmContent ?? null,
    utm_term: a.utmTerm ?? null,
    landing_url: a.landingUrl ?? null,
  }
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
})

describe.each(AD_NAMES)('ad %s', (adName) => {
  beforeEach(() => {
    // Meta appends fbclid to the destination URL on a real click.
    env = visit(`${adUrl(adName)}&fbclid=IwAR_${adName}`)
    captureAttribution()
  })

  it('lands every utm_* plus the click id on the booking row', () => {
    const row = bookingRowColumns(getAttribution())
    expect(row.utm_source).toBe('meta')
    expect(row.utm_medium).toBe('paid')
    expect(row.utm_campaign).toBe(CAMPAIGN)
    expect(row.utm_content).toBe(adName) // the ad name — how we read winners
    expect(row.fbclid).toBe(`IwAR_${adName}`)
    expect(row.fbc).toMatch(new RegExp(`^fb\\.1\\.\\d+\\.IwAR_${adName}$`))
    expect(row.landing_url).toContain(`utm_content=${adName}`)
  })

  it('keeps utm_content after the visitor navigates around the site', () => {
    // Real behaviour: land on the ad URL, browse, come back to /book clean.
    env = visit(`${SITE}/pricing`, env)
    captureAttribution()
    env = visit(`${SITE}/book?code=FASTESTLAP`, env)
    captureAttribution()

    const row = bookingRowColumns(getAttribution())
    expect(row.utm_content).toBe(adName)
    expect(row.utm_campaign).toBe(CAMPAIGN)
  })

  it('still reports the ad when localStorage is blocked', () => {
    // Private mode: nothing persists, but the ad lands directly on /book so the
    // params are still in the address bar at submit time.
    env = visit(`${adUrl(adName)}&fbclid=IwAR_${adName}`)
    env.window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    captureAttribution()

    const row = bookingRowColumns(getAttribution())
    expect(row.utm_content).toBe(adName)
    expect(row.utm_campaign).toBe(CAMPAIGN)
  })

  it('reports the source as Facebook or Instagram for mc_bookings', () => {
    expect(deriveAttributedSource(getAttribution())).toBe('Facebook or Instagram')
  })
})

describe('cross-ad behaviour', () => {
  it('re-attributes to the most recent ad clicked', () => {
    // Someone who clicks two different ads must be credited to the last one,
    // not the first, or the losing creative keeps stealing the booking.
    env = visit(`${adUrl('DateNight_Static_Blue')}&fbclid=IwAR_ONE`)
    captureAttribution()
    env = visit(`${adUrl('DoorReveal_Video_A')}&fbclid=IwAR_TWO`, env)
    captureAttribution()

    const row = bookingRowColumns(getAttribution())
    expect(row.utm_content).toBe('DoorReveal_Video_A')
    expect(row.fbclid).toBe('IwAR_TWO')
  })

  it('leaves utm columns null for an organic visit', () => {
    env = visit(`${SITE}/book`)
    captureAttribution()
    const row = bookingRowColumns(getAttribution())
    expect(row.utm_content).toBeNull()
    expect(row.utm_campaign).toBeNull()
    expect(row.fbclid).toBeNull()
    // …and the source falls through to the how-heard backfill rather than
    // inventing a campaign.
    expect(deriveAttributedSource(getAttribution())).toBeNull()
  })

  it('round-trips every ad name exactly, digits and underscores included', () => {
    for (const adName of AD_NAMES) {
      env = visit(`${adUrl(adName)}&fbclid=X`)
      captureAttribution()
      expect(bookingRowColumns(getAttribution()).utm_content).toBe(adName)
    }
  })
})
