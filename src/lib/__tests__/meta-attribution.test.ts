// Ad-click attribution: URL parsing, click-id construction, and the
// UTM → canonical-source mapping that feeds mc_bookings.attributed_source.
//
// These are the pure halves of the tracking fix — the parts that decide whether
// a server-side Schedule event carries a click id Meta can attribute, and
// whether our own reporting agrees with Ads Manager.
import { describe, it, expect } from 'vitest'
import {
  parseAttributionParams,
  deriveAttributedSource,
  sanitizeAttribution,
  type Attribution,
} from '../meta/attribution'
import { buildFbc, resolveFbc } from '../meta/capi'

const params = (qs: string) => new URLSearchParams(qs)

describe('parseAttributionParams', () => {
  it('pulls fbclid and every utm_* field off the query string', () => {
    const a = parseAttributionParams(
      params(
        'fbclid=IwAR123&utm_source=facebook&utm_medium=paid_social' +
          '&utm_campaign=aug-sim&utm_content=carousel-a&utm_term=simracing'
      )
    )
    expect(a).toEqual({
      fbclid: 'IwAR123',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      utmCampaign: 'aug-sim',
      utmContent: 'carousel-a',
      utmTerm: 'simracing',
    })
  })

  it('omits absent and blank params rather than storing empty strings', () => {
    // An empty utm_source must not shadow a real one captured on a later visit.
    expect(parseAttributionParams(params('utm_source=&fbclid=  '))).toEqual({})
    expect(parseAttributionParams(params(''))).toEqual({})
  })

  it('trims surrounding whitespace', () => {
    expect(parseAttributionParams(params('utm_source=%20google%20')).utmSource).toBe('google')
  })

  it('caps absurdly long values so a junk URL cannot bloat the row', () => {
    const long = 'x'.repeat(500)
    expect(parseAttributionParams(params(`utm_campaign=${long}`)).utmCampaign).toHaveLength(255)
  })
})

describe('buildFbc / resolveFbc', () => {
  it('builds Meta click-id format fb.1.<clickTime>.<fbclid>', () => {
    expect(buildFbc('IwAR9', 1723075200000)).toBe('fb.1.1723075200000.IwAR9')
  })

  it('prefers a real _fbc cookie over rebuilding one', () => {
    expect(
      resolveFbc({ fbc: 'fb.1.111.COOKIE', fbclid: 'RAW', clickTimeMs: 222 })
    ).toBe('fb.1.111.COOKIE')
  })

  it('rebuilds fbc from a stored fbclid when the Pixel never wrote the cookie', () => {
    // This is the whole point: an ad-blocked landing still yields a click id.
    expect(resolveFbc({ fbclid: 'RAW', clickTimeMs: 1723075200000 })).toBe(
      'fb.1.1723075200000.RAW'
    )
  })

  it('returns undefined when there is neither a cookie nor an fbclid', () => {
    expect(resolveFbc({})).toBeUndefined()
    expect(resolveFbc({ fbc: null, fbclid: null })).toBeUndefined()
  })
})

describe('deriveAttributedSource', () => {
  const attr = (o: Partial<Attribution>): Attribution => o

  it('treats any click id as Facebook or Instagram', () => {
    expect(deriveAttributedSource(attr({ fbclid: 'IwAR1' }))).toBe('Facebook or Instagram')
    expect(deriveAttributedSource(attr({ fbc: 'fb.1.1.x' }))).toBe('Facebook or Instagram')
  })

  it('lets the click id outrank a disagreeing utm_source', () => {
    // A click id can only come from a Meta ad; a mis-tagged utm must not win.
    expect(deriveAttributedSource(attr({ fbclid: 'IwAR1', utmSource: 'google' }))).toBe(
      'Facebook or Instagram'
    )
  })

  it('maps common utm_source values onto the canonical set', () => {
    expect(deriveAttributedSource(attr({ utmSource: 'facebook' }))).toBe('Facebook or Instagram')
    expect(deriveAttributedSource(attr({ utmSource: 'instagram' }))).toBe('Facebook or Instagram')
    expect(deriveAttributedSource(attr({ utmSource: 'google' }))).toBe('Google')
    expect(deriveAttributedSource(attr({ utmSource: 'radio' }))).toBe('Radio')
  })

  it('returns null with no signal, so the how-heard backfill still applies', () => {
    expect(deriveAttributedSource(attr({}))).toBeNull()
    expect(deriveAttributedSource(attr({ utmCampaign: 'aug-sim' }))).toBeNull()
  })
})

describe('sanitizeAttribution', () => {
  it('keeps a well-formed bundle intact', () => {
    const input = {
      fbp: 'fb.1.1723075200000.1234567890',
      fbc: 'fb.1.1723075200000.IwAR9',
      fbclid: 'IwAR9',
      fbclidTs: 1723075200000,
      utmSource: 'facebook',
      utmCampaign: 'aug-sim',
      landingUrl: 'https://www.mcracingfortwayne.com/?fbclid=IwAR9',
    }
    expect(sanitizeAttribution(input)).toEqual(input)
  })

  it('drops malformed fbp/fbc rather than passing them to Meta', () => {
    // Meta rejects the whole event on a bad cookie value, so no value beats a
    // wrong one.
    const out = sanitizeAttribution({ fbp: 'not-a-cookie', fbc: '<script>', fbclid: 'IwAR9' })
    expect(out.fbp).toBeUndefined()
    expect(out.fbc).toBeUndefined()
    expect(out.fbclid).toBe('IwAR9') // raw click id is still usable
  })

  it('strips unknown keys so nothing unexpected reaches the row', () => {
    const out = sanitizeAttribution({ utmSource: 'google', evil: 'x', __proto__: {} })
    expect(out).toEqual({ utmSource: 'google' })
  })

  it('caps oversized values', () => {
    const out = sanitizeAttribution({
      utmCampaign: 'x'.repeat(5000),
      landingUrl: 'y'.repeat(5000),
    })
    expect(out.utmCampaign).toHaveLength(255)
    expect(out.landingUrl).toHaveLength(500)
  })

  it('rejects a non-numeric or negative click timestamp', () => {
    expect(sanitizeAttribution({ fbclidTs: 'yesterday' }).fbclidTs).toBeUndefined()
    expect(sanitizeAttribution({ fbclidTs: -5 }).fbclidTs).toBeUndefined()
    expect(sanitizeAttribution({ fbclidTs: NaN }).fbclidTs).toBeUndefined()
  })

  it('returns an empty bundle for junk input', () => {
    expect(sanitizeAttribution(null)).toEqual({})
    expect(sanitizeAttribution('nope')).toEqual({})
    expect(sanitizeAttribution(undefined)).toEqual({})
  })
})
