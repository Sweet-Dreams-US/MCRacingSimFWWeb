// src/lib/meta/attribution.ts
// First-touch ad attribution capture — the piece that lets a SERVER event tie
// back to the ad click that caused it.
//
// The problem this solves: Meta's Pixel writes `_fbc` (the click id) only if
// fbevents.js actually executed on the landing page. An ad-blocker, a slow
// network, or a bounce-and-return kills it — and once the `?fbclid=` param is
// gone from the URL, the click id is unrecoverable. A Schedule event with no
// fbc is a conversion Meta cannot credit to a campaign, which is exactly how a
// booking becomes invisible in Ads Manager.
//
// So: on EVERY page load we read fbclid/utm_* off the URL and the _fbp/_fbc
// cookies, and persist them first-touch in localStorage. At booking time the
// browser hands the whole bundle to /api/booking/create, which writes it onto
// the booking row. The Stripe webhook — running minutes later with no browser
// in sight — reads it back and forwards fbp/fbc to the Conversions API.
//
// Pure parsing/derivation helpers are exported separately from the
// browser-only storage helpers so the server (and unit tests) can use them.
import { toAttributionSource, type AttributionSource } from '../attribution'

/** Everything we persist about how a visitor arrived. All optional. */
export interface Attribution {
  /** Meta browser id cookie (`fb.1.<ts>.<rand>`). */
  fbp?: string
  /** Meta click id (`fb.1.<clickTs>.<fbclid>`). */
  fbc?: string
  /** Raw fbclid from the URL, kept so fbc can be rebuilt server-side. */
  fbclid?: string
  /** Epoch ms of the click that carried fbclid. */
  fbclidTs?: number
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  /** The first page of the session, with its query string. */
  landingUrl?: string
}

/** localStorage key. Versioned so a shape change can't crash on stale JSON. */
const STORAGE_KEY = 'mc_attr_v1'
/** Meta's own _fbc/_fbp lifetime. */
const COOKIE_MAX_AGE_DAYS = 90

// ---------------------------------------------------------------------------
// Pure helpers (safe on the server + in tests)
// ---------------------------------------------------------------------------

/** Trim, drop empties, and cap length so a junk URL can't bloat a DB row. */
function clean(v: string | null | undefined, max = 255): string | undefined {
  if (!v) return undefined
  const t = v.trim().slice(0, max)
  return t || undefined
}

/**
 * Pull fbclid + utm_* out of a query string. Accepts URLSearchParams so both
 * the browser (location.search) and the server (request URL) can call it.
 */
export function parseAttributionParams(params: URLSearchParams): Attribution {
  const attr: Attribution = {}
  const fbclid = clean(params.get('fbclid'))
  if (fbclid) attr.fbclid = fbclid
  const utmSource = clean(params.get('utm_source'))
  if (utmSource) attr.utmSource = utmSource
  const utmMedium = clean(params.get('utm_medium'))
  if (utmMedium) attr.utmMedium = utmMedium
  const utmCampaign = clean(params.get('utm_campaign'))
  if (utmCampaign) attr.utmCampaign = utmCampaign
  const utmContent = clean(params.get('utm_content'))
  if (utmContent) attr.utmContent = utmContent
  const utmTerm = clean(params.get('utm_term'))
  if (utmTerm) attr.utmTerm = utmTerm
  return attr
}

/**
 * The self-reported "How did you hear about us?" dropdown is the customer's
 * word; UTMs and fbclid are the machine's. When the machine knows, it wins —
 * that's the whole point of first-party attribution that doesn't depend on
 * Meta's reporting agreeing with us.
 *
 * Returns one of the values `mc_bookings.attributed_source` allows, or null to
 * leave the column alone (so the existing how-heard backfill still applies).
 */
export function deriveAttributedSource(attr: Attribution): AttributionSource | null {
  // A click id can only come from a Meta ad click. Strongest signal there is,
  // and it outranks any utm_source that might disagree.
  if (attr.fbclid || attr.fbc) return 'Facebook or Instagram'
  // Otherwise let the canonical normalizer map utm_source onto the seven
  // allowed values (it is also what the CHECK constraint is derived from).
  return toAttributionSource(attr.utmSource)
}

/**
 * Harden an attribution bundle that arrived in a request body.
 *
 * Everything here is client-supplied and therefore untrusted: it is written
 * straight onto a database row and later forwarded to Meta. We keep only known
 * keys, coerce to strings, cap lengths, and drop anything that isn't shaped
 * like Meta's `fb.<n>.<ts>.<id>` cookie format — a malformed fbp/fbc makes Meta
 * reject the whole event, so a bad value is worse than no value.
 */
export function sanitizeAttribution(raw: unknown): Attribution {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const str = (v: unknown, max = 255): string | undefined =>
    typeof v === 'string' ? clean(v, max) : undefined
  // fb.<subdomainIndex>.<creationMs>.<payload>
  const fbCookie = (v: unknown): string | undefined => {
    const val = str(v, 255)
    return val && /^fb\.\d+\.\d+\..+$/.test(val) ? val : undefined
  }

  const out: Attribution = {}
  const fbp = fbCookie(r.fbp)
  if (fbp) out.fbp = fbp
  const fbc = fbCookie(r.fbc)
  if (fbc) out.fbc = fbc
  const fbclid = str(r.fbclid)
  if (fbclid) out.fbclid = fbclid
  // Only accept a plausible epoch-ms click time; anything else falls back to
  // "now" downstream rather than sending Meta a nonsense timestamp.
  if (typeof r.fbclidTs === 'number' && Number.isFinite(r.fbclidTs) && r.fbclidTs > 0) {
    out.fbclidTs = Math.floor(r.fbclidTs)
  }
  const utmSource = str(r.utmSource)
  if (utmSource) out.utmSource = utmSource
  const utmMedium = str(r.utmMedium)
  if (utmMedium) out.utmMedium = utmMedium
  const utmCampaign = str(r.utmCampaign)
  if (utmCampaign) out.utmCampaign = utmCampaign
  const utmContent = str(r.utmContent)
  if (utmContent) out.utmContent = utmContent
  const utmTerm = str(r.utmTerm)
  if (utmTerm) out.utmTerm = utmTerm
  const landingUrl = str(r.landingUrl, 500)
  if (landingUrl) out.landingUrl = landingUrl
  return out
}

// ---------------------------------------------------------------------------
// Browser-only storage
// ---------------------------------------------------------------------------

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : undefined
}

/**
 * Write a first-party cookie on the registrable domain so it survives the
 * www/apex split (a customer who clicks an ad to mcracingfortwayne.com and
 * later books on www. must keep the same click id).
 */
function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60
  // Strip a leading "www." to get the registrable domain; leave localhost and
  // bare hosts alone (a Domain attribute on "localhost" is rejected).
  const host = window.location.hostname
  const domain = host.split('.').length > 2 ? host.replace(/^www\./, '') : host
  const domainPart = host === 'localhost' || /^\d+\./.test(host) ? '' : `; domain=.${domain}`
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}` +
    `${domainPart}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
}

function loadStored(): Attribution {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Attribution) : {}
  } catch {
    return {} // private mode / quota / corrupt JSON — degrade silently
  }
}

function save(attr: Attribution) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attr))
  } catch {
    /* storage unavailable — this page load still sends what it captured */
  }
}

/** Meta's format for a self-generated browser id. */
function generateFbp(nowMs: number): string {
  // 10 random digits, matching what fbevents.js writes.
  const rand = Math.floor(Math.random() * 1e10)
    .toString()
    .padStart(10, '0')
  return `fb.1.${nowMs}.${rand}`
}

/**
 * Run on every page load. Merges this load's signals into stored first-touch
 * attribution and returns the result.
 *
 * Merge rules:
 *  - A NEW fbclid always wins. A fresh ad click must re-attribute, otherwise a
 *    repeat visitor's booking gets credited to a campaign from three months ago.
 *  - UTMs are first-touch: only filled when currently empty, so an internal
 *    link (/book?code=FASTESTLAP) can't erase the campaign that brought them.
 *  - fbp/fbc cookies are re-read every time; the Pixel may have written them
 *    after our first pass.
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {}

  const stored = loadStored()
  const fromUrl = parseAttributionParams(new URLSearchParams(window.location.search))
  const now = Date.now()

  const next: Attribution = { ...stored }

  // --- fbclid: newest click wins -------------------------------------------
  if (fromUrl.fbclid && fromUrl.fbclid !== stored.fbclid) {
    next.fbclid = fromUrl.fbclid
    next.fbclidTs = now
    // Overwrite the stale click id so downstream fbc is rebuilt from this click.
    next.fbc = `fb.1.${now}.${fromUrl.fbclid}`
    writeCookie('_fbc', next.fbc)
    // A new campaign click also re-stamps the campaign fields.
    next.utmSource = fromUrl.utmSource ?? next.utmSource
    next.utmMedium = fromUrl.utmMedium ?? next.utmMedium
    next.utmCampaign = fromUrl.utmCampaign ?? next.utmCampaign
    next.utmContent = fromUrl.utmContent ?? next.utmContent
    next.utmTerm = fromUrl.utmTerm ?? next.utmTerm
    next.landingUrl = clean(window.location.href, 500)
  } else {
    // --- UTMs: first touch wins --------------------------------------------
    next.utmSource ??= fromUrl.utmSource
    next.utmMedium ??= fromUrl.utmMedium
    next.utmCampaign ??= fromUrl.utmCampaign
    next.utmContent ??= fromUrl.utmContent
    next.utmTerm ??= fromUrl.utmTerm
    next.landingUrl ??= clean(window.location.href, 500)
  }

  // --- Cookies: the Pixel's values are authoritative when present ----------
  const cookieFbc = readCookie('_fbc')
  if (cookieFbc) next.fbc = cookieFbc
  else if (next.fbc) writeCookie('_fbc', next.fbc) // re-assert ours if cleared

  const cookieFbp = readCookie('_fbp')
  if (cookieFbp) {
    next.fbp = cookieFbp
  } else {
    // No _fbp — either the Pixel hasn't finished loading or it was blocked.
    // Reuse the id we minted earlier if we have one, else mint a fresh one, so
    // browser + server events for this visitor share a single browser id.
    // fbevents.js adopts an existing _fbp cookie rather than replacing it.
    next.fbp ??= generateFbp(now)
    writeCookie('_fbp', next.fbp)
  }

  save(next)
  return next
}

/** Read what we've stored, without re-capturing. Safe to call any time. */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return {}
  const stored = loadStored()
  // Cookies can be fresher than storage (Pixel wrote them after our last pass).
  const fbc = readCookie('_fbc')
  const fbp = readCookie('_fbp')
  return { ...stored, ...(fbc ? { fbc } : {}), ...(fbp ? { fbp } : {}) }
}
