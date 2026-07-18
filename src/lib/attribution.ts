// Marketing attribution — "How did you hear about us?" as a STRUCTURED value.
//
// These 7 canonical options are the single source of truth for the waiver /
// check-in form, the booking form's normalized attribution, and the
// customers.attributed_source + mc_bookings.attributed_source columns (whose
// CHECK constraints must match this list). Never store a free-text paragraph.

export const ATTRIBUTION_SOURCES = [
  'Facebook or Instagram',
  'Google',
  'Walk-by',
  'Referral',
  'Repeat customer',
  'Event',
  'Other',
] as const

export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number]

export function isAttributionSource(v: unknown): v is AttributionSource {
  return typeof v === 'string' && (ATTRIBUTION_SOURCES as readonly string[]).includes(v)
}

/**
 * Normalize ANY "how did you hear" string — the canonical values, the legacy
 * booking/check-in dropdown options, or historical free text — to one of the 7
 * canonical sources. Returns null for blank/unknown-empty so we never guess an
 * attribution (per spec: leave it null rather than invent one).
 */
export function toAttributionSource(raw: string | null | undefined): AttributionSource | null {
  if (!raw) return null
  const s = raw.trim()
  if (!s) return null
  if (isAttributionSource(s)) return s // already canonical

  const lower = s.toLowerCase()
  if (lower.includes('facebook') || lower.includes('instagram') || lower === 'fb' || lower === 'ig' || lower.includes('meta'))
    return 'Facebook or Instagram'
  if (lower.includes('google') || lower.includes('search')) return 'Google'
  if (lower.includes('walk') || lower.includes('drove') || lower.includes('drive'))
    return 'Walk-by'
  if (lower.includes('friend') || lower.includes('family') || lower.includes('refer') || lower.includes('word of mouth'))
    return 'Referral'
  if (lower.includes('repeat') || lower.includes('return') || lower.includes('been here') || lower.includes('again'))
    return 'Repeat customer'
  if (lower.includes('event') || lower.includes('show') || lower.includes('fair') || lower.includes('expo'))
    return 'Event'
  return 'Other'
}
