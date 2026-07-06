// src/lib/meta/capi.ts
// Meta (Facebook) Conversions API — server-to-server event forwarding.
//
// Why this exists: the browser Pixel (src/components/MetaPixel.tsx) is dropped
// by ad-blockers, iOS ITP, and consent tools ~20-40% of the time. CAPI sends
// the same conversions from our Vercel functions where nothing can block them.
// Meta DEDUPLICATES a Pixel event and a CAPI event that share the same
// (event_name, event_id), so firing both = one conversion, far better matched.
//
// PII rule: Meta never receives raw email/phone/name. We SHA-256 hash every
// identifier here, on the server, before it leaves the building (per Meta's
// advanced-matching spec — see the Conversions API Payload Helper).
//
// Design: never throws. A tracking failure must never break a booking, a
// contact submission, or a payment. Everything is wrapped + logged.
import crypto from 'crypto'

const GRAPH_VERSION = 'v21.0'
// Dataset (a.k.a. Pixel) ID + access token live in Vercel env. Hardcoded
// fallback is the *public* dataset id, so the module still functions if the
// env var is briefly missing; the token has NO fallback (it is a secret).
const DATASET_ID = process.env.META_DATASET_ID || '936045282838979'
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN || ''

/** SHA-256 hex of a normalized string (lowercased + trimmed). Meta's format. */
function hashField(value?: string | null): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/** Phone must be hashed as digits-only, E.164 without '+' (US → prefix 1). */
function hashPhone(phone?: string | null): string | undefined {
  if (!phone) return undefined
  let digits = phone.replace(/\D/g, '')
  if (!digits) return undefined
  if (digits.length === 10) digits = '1' + digits // assume US local number
  return crypto.createHash('sha256').update(digits).digest('hex')
}

export interface MetaUserData {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  /** A stable non-PII id (we use customer_id) — hashed, boosts matching. */
  externalId?: string | null
  /** From x-forwarded-for — NOT hashed. */
  clientIpAddress?: string | null
  /** From user-agent header — NOT hashed. */
  clientUserAgent?: string | null
  /** _fbp cookie set by the Pixel — NOT hashed. Strongest match signal. */
  fbp?: string | null
  /** _fbc cookie (click id) set by the Pixel — NOT hashed. */
  fbc?: string | null
}

export interface MetaEvent {
  /** Standard event name: 'Lead' | 'Schedule' | 'Purchase' | 'ViewContent' … */
  eventName: string
  /** Shared with the Pixel so Meta dedupes the pair. Omit for server-only. */
  eventId?: string
  /** Page the action happened on — required for good 'website' attribution. */
  eventSourceUrl?: string
  actionSource?: 'website' | 'system_generated' | 'physical_store' | 'app' | 'other'
  userData: MetaUserData
  /** value/currency/content_name/num_items … per Meta's custom_data spec. */
  customData?: Record<string, unknown>
  /** Unix SECONDS. Defaults to now. Must be within the last 7 days. */
  eventTime?: number
}

function buildUserData(u: MetaUserData): Record<string, unknown> {
  const ud: Record<string, unknown> = {}
  const em = hashField(u.email)
  if (em) ud.em = em
  const ph = hashPhone(u.phone)
  if (ph) ud.ph = ph
  const fn = hashField(u.firstName)
  if (fn) ud.fn = fn
  const ln = hashField(u.lastName)
  if (ln) ud.ln = ln
  const ext = hashField(u.externalId)
  if (ext) ud.external_id = ext
  if (u.clientIpAddress) ud.client_ip_address = u.clientIpAddress
  if (u.clientUserAgent) ud.client_user_agent = u.clientUserAgent
  if (u.fbp) ud.fbp = u.fbp
  if (u.fbc) ud.fbc = u.fbc
  return ud
}

/**
 * Forward one event to Meta's Conversions API. Fire-and-forget: resolves even
 * on failure (logs instead of throwing) so callers never need a try/catch.
 */
export async function sendMetaEvent(ev: MetaEvent): Promise<void> {
  if (!ACCESS_TOKEN) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[meta] META_CAPI_TOKEN not set — skipping ${ev.eventName}`)
    }
    return
  }

  const payload = {
    data: [
      {
        event_name: ev.eventName,
        event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
        action_source: ev.actionSource ?? 'website',
        ...(ev.eventId ? { event_id: ev.eventId } : {}),
        ...(ev.eventSourceUrl ? { event_source_url: ev.eventSourceUrl } : {}),
        user_data: buildUserData(ev.userData),
        ...(ev.customData ? { custom_data: ev.customData } : {}),
      },
    ],
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[meta] CAPI ${ev.eventName} failed: ${res.status} ${text}`)
    }
  } catch (err) {
    console.error(`[meta] CAPI ${ev.eventName} network error:`, err)
  }
}

/**
 * Pull the browser-match signals (fbp/fbc cookies, IP, UA) off an incoming
 * request. Only meaningful when the event fires inside a request the customer's
 * browser made — pass the result as part of MetaUserData.
 */
export function metaContextFromRequest(request: Request): Partial<MetaUserData> {
  const cookie = request.headers.get('cookie') ?? ''
  const readCookie = (name: string): string | undefined => {
    const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'))
    return m ? decodeURIComponent(m[1]) : undefined
  }
  return {
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    clientIpAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    clientUserAgent: request.headers.get('user-agent') || undefined,
  }
}

/** Split a single "First Last" string into parts for hashing. */
export function splitName(full?: string | null): { firstName?: string; lastName?: string } {
  if (!full) return {}
  const parts = full.trim().split(/\s+/)
  if (parts.length === 0) return {}
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || undefined }
}
