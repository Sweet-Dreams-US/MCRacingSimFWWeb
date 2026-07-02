// Pure, client-safe party constants + helpers (NO server imports). Both client
// components and the server-only src/lib/parties.ts import from here so the
// Stripe/Supabase code in parties.ts never gets pulled into a client bundle.

export const PARTY_TYPES = ['birthday', 'corporate', 'general'] as const
export type PartyType = (typeof PARTY_TYPES)[number]

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  birthday: 'Birthday party',
  corporate: 'Corporate event',
  general: 'Group event',
}

export function isPartyType(s: string): s is PartyType {
  return (PARTY_TYPES as readonly string[]).includes(s)
}

export function partyTypeLabel(t: string): string {
  return isPartyType(t) ? PARTY_TYPE_LABELS[t] : t
}

/** 50% deposit, rounded to the nearest cent. */
export function computeDepositCents(totalCents: number): number {
  return Math.round(totalCents / 2)
}
