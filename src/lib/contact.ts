// Contact-inquiry reason categories — shared by the public form, the intake
// API, and the admin inbox so labels + validation never drift.

export const CONTACT_REASONS = [
  'birthday',
  'corporate',
  'large_group',
  'general',
  'other',
] as const

export type ContactReason = (typeof CONTACT_REASONS)[number]

export function isContactReason(s: string): s is ContactReason {
  return (CONTACT_REASONS as readonly string[]).includes(s)
}

export const CONTACT_REASON_LABELS: Record<ContactReason, string> = {
  birthday: 'Birthday party',
  corporate: 'Corporate / team event',
  large_group: 'Large group (5+)',
  general: 'General question',
  other: 'Something else',
}

export function contactReasonLabel(reason: string): string {
  return isContactReason(reason) ? CONTACT_REASON_LABELS[reason] : reason
}

// Reasons where a preferred date + group size are worth asking for.
export const EVENT_REASONS: ReadonlySet<ContactReason> = new Set<ContactReason>([
  'birthday',
  'corporate',
  'large_group',
])
