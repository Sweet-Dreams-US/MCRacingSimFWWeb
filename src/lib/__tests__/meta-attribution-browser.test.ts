// Browser-side capture: the merge rules that decide which campaign a booking
// gets credited to, and the fbp/fbc fallbacks that keep a conversion
// attributable when the Meta Pixel itself never ran.
//
// These stub the three browser globals the module touches (window, document
// .cookie, localStorage) rather than pulling in jsdom — the suite stays in the
// plain Node environment this project's vitest config is built around.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { captureAttribution, getAttribution } from '../meta/attribution'

/** Minimal cookie jar with real document.cookie get/set semantics. */
function makeFakeBrowser(href: string) {
  const jar = new Map<string, string>()
  const store = new Map<string, string>()
  const url = new URL(href)

  const document = {
    get cookie(): string {
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')
    },
    set cookie(raw: string) {
      // "name=value; path=/; max-age=…" — only the first pair is the cookie.
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

function install(href: string) {
  const fake = makeFakeBrowser(href)
  ;(globalThis as Record<string, unknown>).window = fake.window
  ;(globalThis as Record<string, unknown>).document = fake.document
  return fake
}

// Carry the cookie jar + storage across "page loads" the way a real browser does.
function reload(prev: ReturnType<typeof install>, href: string) {
  const next = install(href)
  prev.jar.forEach((v, k) => next.jar.set(k, v))
  prev.store.forEach((v, k) => next.store.set(k, v))
  return next
}

let fake: ReturnType<typeof install>

beforeEach(() => {
  fake = install('https://www.mcracingfortwayne.com/')
})

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window
  delete (globalThis as Record<string, unknown>).document
})

describe('captureAttribution', () => {
  it('rebuilds and persists a click id when the Pixel never wrote _fbc', () => {
    fake = install('https://www.mcracingfortwayne.com/?fbclid=IwAR9')
    const attr = captureAttribution()

    expect(attr.fbclid).toBe('IwAR9')
    expect(attr.fbc).toMatch(/^fb\.1\.\d+\.IwAR9$/)
    // …and writes it as a first-party cookie so the browser Pixel sees it too.
    expect(fake.jar.get('_fbc')).toMatch(/^fb\.1\.\d+\.IwAR9$/)
  })

  it('mints an _fbp when the Pixel is blocked, so both halves share one id', () => {
    const attr = captureAttribution()
    expect(attr.fbp).toMatch(/^fb\.1\.\d+\.\d{10}$/)
    expect(fake.jar.get('_fbp')).toBe(attr.fbp)
  })

  it('defers to the real _fbp/_fbc the Pixel wrote', () => {
    fake.jar.set('_fbp', 'fb.1.111.9999999999')
    fake.jar.set('_fbc', 'fb.1.222.REALCLICK')
    const attr = captureAttribution()
    expect(attr.fbp).toBe('fb.1.111.9999999999')
    expect(attr.fbc).toBe('fb.1.222.REALCLICK')
  })

  it('keeps first-touch UTMs across an internal navigation', () => {
    fake = install('https://www.mcracingfortwayne.com/?utm_source=facebook&utm_campaign=aug-sim')
    captureAttribution()

    // The customer now clicks an internal link with its own query string.
    fake = reload(fake, 'https://www.mcracingfortwayne.com/book?code=FASTESTLAP')
    const attr = captureAttribution()

    expect(attr.utmSource).toBe('facebook')
    expect(attr.utmCampaign).toBe('aug-sim')
    expect(attr.landingUrl).toContain('utm_source=facebook')
  })

  it('re-attributes on a NEW ad click rather than crediting the old campaign', () => {
    fake = install('https://www.mcracingfortwayne.com/?fbclid=OLD&utm_campaign=july')
    const first = captureAttribution()
    expect(first.utmCampaign).toBe('july')

    fake = reload(fake, 'https://www.mcracingfortwayne.com/?fbclid=NEW&utm_campaign=august')
    const second = captureAttribution()

    expect(second.fbclid).toBe('NEW')
    expect(second.fbc).toMatch(/\.NEW$/)
    expect(second.utmCampaign).toBe('august')
  })

  it('survives localStorage being unavailable (private mode)', () => {
    fake = install('https://www.mcracingfortwayne.com/?fbclid=IwAR9')
    fake.window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    // Must not throw — this page load still captures and still writes the
    // cookies, it just can't persist across loads.
    expect(() => captureAttribution()).not.toThrow()
    expect(captureAttribution().fbclid).toBe('IwAR9')
    expect(fake.jar.get('_fbc')).toMatch(/\.IwAR9$/)
  })
})

describe('getAttribution', () => {
  it('returns what a previous page load captured', () => {
    fake = install('https://www.mcracingfortwayne.com/?fbclid=IwAR9&utm_source=facebook')
    captureAttribution()

    fake = reload(fake, 'https://www.mcracingfortwayne.com/book')
    const attr = getAttribution()
    expect(attr.fbclid).toBe('IwAR9')
    expect(attr.utmSource).toBe('facebook')
    expect(attr.fbc).toMatch(/\.IwAR9$/)
  })

  it('prefers a fresher cookie over the stored copy', () => {
    captureAttribution()
    fake.jar.set('_fbc', 'fb.1.999.FRESH')
    expect(getAttribution().fbc).toBe('fb.1.999.FRESH')
  })

  it('reports no campaign for an organic visit', () => {
    const attr = getAttribution()
    expect(attr.fbclid).toBeUndefined()
    expect(attr.utmSource).toBeUndefined()
    expect(attr.utmContent).toBeUndefined()
    expect(attr.fbc).toBeUndefined()
    // landingUrl is still filled from the current page — it is the
    // event_source_url for any event fired from here, campaign or not.
    expect(attr.landingUrl).toBe('https://www.mcracingfortwayne.com/')
  })
})
