// src/lib/marketing/audience-export.ts
// Customer List export for a Meta Custom Audience (and the Lookalike seeded
// from it).
//
// EMAIL ONLY, DELIBERATELY. No phone column, ever.
//
// This is the same decision as dropping `ph` from the Conversions API: our SMS
// program runs under a 10DLC/A2P disclosure promising we do not share mobile
// information with third parties for marketing or promotional purposes. A phone
// list uploaded for ad targeting is the most literal possible instance of that,
// so it is out. Meta hashes on upload; we still send only what we are willing
// to share.
//
// Suppression reuses isEmailable() / getEmailableAudience() from ./send, which
// is the single source of truth for "may we market to this person": no
// unsubscribes, no bounces, no spam complaints, deduplicated by inbox. Reusing
// it means an ad audience can never drift from the email suppression list -- an
// unsubscribe removes someone from both at once.
import type { createAdminClient } from '../supabase/admin'
import { getEmailableAudience } from './send'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

/** Meta needs at least 100 MATCHED people to build a Lookalike from a seed. */
export const META_LOOKALIKE_MIN_MATCHES = 100
/** Rough industry match rate for an email-only list. Used only for guidance. */
export const ASSUMED_MATCH_RATE = 0.7

export interface AudienceExport {
  /** RFC 4180 CSV: a single `email` header plus one address per line. */
  csv: string
  /** Unique inboxes in the file. */
  count: number
  /** count * ASSUMED_MATCH_RATE, rounded. Guidance, not a promise. */
  estimatedMatches: number
  /** Whether the estimate clears Meta's Lookalike floor. */
  clearsLookalikeFloor: boolean
}

/**
 * Build the CSV. One `email` column, lowercased and trimmed, deduplicated.
 *
 * Meta accepts a plain single-column file and hashes client-side on upload, so
 * we deliberately do NOT pre-hash: a pre-hashed file is harder for a human to
 * eyeball before uploading, and Meta's own normalization (lowercase + trim) is
 * exactly what we apply here anyway.
 */
export async function buildCustomerListCsv(
  supabase: SupabaseAdmin
): Promise<AudienceExport> {
  // Already deduplicated by lowercased email and already suppression-filtered.
  const audience = await getEmailableAudience(supabase)

  const emails = audience
    .map((c) => (c.email ?? '').trim().toLowerCase())
    .filter((e) => e.includes('@'))

  // getEmailableAudience dedupes, but re-assert it here: this file goes to a
  // third party, and a duplicate row would quietly skew the match rate.
  const unique = Array.from(new Set(emails)).sort()

  // CRLF per RFC 4180, with a trailing newline. No quoting needed: an address
  // containing a comma, quote, or newline is not a valid email, and the
  // includes('@') filter above has already dropped anything malformed.
  const csv = ['email', ...unique].join('\r\n') + '\r\n'

  const estimatedMatches = Math.round(unique.length * ASSUMED_MATCH_RATE)
  return {
    csv,
    count: unique.length,
    estimatedMatches,
    clearsLookalikeFloor: estimatedMatches >= META_LOOKALIKE_MIN_MATCHES,
  }
}

/** Dated filename so successive exports do not overwrite each other. */
export function audienceExportFilename(now = new Date()): string {
  return `mc-racing-customer-list-${now.toISOString().slice(0, 10)}.csv`
}
