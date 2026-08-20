// src/lib/meta/campaign-attribution.ts
// "Which ad actually produced bookings?" - answered from our own database.
//
// Meta's own reporting (src/lib/meta/insights.ts) tells us what Meta believes.
// This tells us what happened, from the utm_* params captured when the visitor
// landed and stored on the booking row. The two are deliberately independent:
// if Meta under-reports (blocked pixel, iOS/AEM drops, attribution-window
// quirks) this still shows the truth, and the disagreement is itself a signal.
//
// utm_content carries the AD NAME, so it is the column that identifies a
// winning creative. Ad names in Ads Manager must match the utm_content values
// in the destination URLs exactly, or these rows fragment.
//
// Never throws: returns a discriminated result so a missing migration or a
// Supabase blip renders a friendly note instead of breaking the admin page.
import { createAdminClient } from '../supabase/admin'
import type { DatePreset } from './insights'

export interface CampaignAttributionRow {
  campaign: string
  /** The ad name, from utm_content. */
  content: string
  bookings: number
  revenueCents: number
  /** How many of these also carried a Meta click id. */
  withClickId: number
}

export type CampaignAttributionResult =
  | { status: 'unavailable'; message: string }
  | {
      status: 'ok'
      rows: CampaignAttributionRow[]
      /** Bookings in the window that arrived with no utm_source at all. */
      organicBookings: number
      organicRevenueCents: number
    }

/** Ads-page preset to lookback days. null = all time. */
export function presetToDays(preset: DatePreset): number | null {
  switch (preset) {
    case 'today':
      return 1
    case 'last_7d':
      return 7
    case 'last_30d':
      return 30
    case 'last_90d':
      return 90
    case 'maximum':
      return null
  }
}

export async function getCampaignAttribution(
  preset: DatePreset
): Promise<CampaignAttributionResult> {
  try {
    const supabase = createAdminClient()
    let query = supabase
      .from('bookings')
      .select(
        'utm_campaign, utm_content, utm_source, fbc, fbclid, session_price_cents, discount_amount_cents'
      )
      .eq('source', 'online')
      .neq('status', 'pending') // everything past the card step

    const days = presetToDays(preset)
    if (days !== null) {
      const since = new Date()
      since.setUTCDate(since.getUTCDate() - days)
      query = query.gte('created_at', since.toISOString())
    }

    const { data, error } = await query
    if (error) {
      // Overwhelmingly the "migration 016 not applied yet" case.
      return {
        status: 'unavailable',
        message: `Needs migration 016 (utm_* columns on bookings). ${error.message}`,
      }
    }

    const byKey = new Map<string, CampaignAttributionRow>()
    let organicBookings = 0
    let organicRevenueCents = 0

    for (const b of data ?? []) {
      const net = Math.max(0, (b.session_price_cents ?? 0) - (b.discount_amount_cents ?? 0))
      // No utm_source at all means this visitor did not arrive through a tagged
      // link. Counted separately rather than bucketed as "(none)", so the
      // campaign rows stay honest about what advertising actually produced.
      if (!b.utm_source) {
        organicBookings++
        organicRevenueCents += net
        continue
      }
      const campaign = b.utm_campaign ?? '(no campaign)'
      const content = b.utm_content ?? '(no ad name)'
      // Unambiguous composite key: a delimiter character could legitimately
      // appear inside a campaign or ad name and merge two distinct rows.
      const key = JSON.stringify([campaign, content])
      const row = byKey.get(key) ?? {
        campaign,
        content,
        bookings: 0,
        revenueCents: 0,
        withClickId: 0,
      }
      row.bookings++
      row.revenueCents += net
      if (b.fbc || b.fbclid) row.withClickId++
      byKey.set(key, row)
    }

    const rows = Array.from(byKey.values()).sort(
      (a, b) => b.bookings - a.bookings || b.revenueCents - a.revenueCents
    )
    return { status: 'ok', rows, organicBookings, organicRevenueCents }
  } catch (err) {
    return {
      status: 'unavailable',
      message: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
