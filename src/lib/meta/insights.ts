// src/lib/meta/insights.ts
// Read Meta ad performance for the admin panel. Server-only — uses a Meta
// token with `ads_read` scope (META_ADS_TOKEN) against the configured ad
// account (META_AD_ACCOUNT_ID). Separate from the CAPI token, which only has
// dataset-quality scope and cannot read ad insights.
//
// Never throws: returns a discriminated result the page renders directly, so a
// Meta outage or a missing token shows a friendly state instead of a 500.

const GRAPH_VERSION = 'v21.0'
const TOKEN = process.env.META_ADS_TOKEN || ''
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || ''
// The ad account is shared across brands (Sweet Dreams Music / Sweet Dreams US
// / MC Racing), so we only count campaigns whose NAME contains this keyword.
// Convention: every MC Racing campaign must include "MC Racing" in its name.
const CAMPAIGN_KEYWORD = process.env.META_CAMPAIGN_KEYWORD || 'MC Racing'

/** Exposed so the admin page can show which brand filter is active. */
export const campaignKeyword = CAMPAIGN_KEYWORD

export type DatePreset = 'today' | 'last_7d' | 'last_30d' | 'last_90d' | 'maximum'

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'maximum', label: 'All time' },
]

// The conversion action types we care about, mapped to friendly labels. Meta
// reports pixel/CAPI conversions under several action_type spellings depending
// on how the event was received, so we match by substring (case-insensitive).
const CONVERSION_MATCHERS: { key: string; label: string; needles: string[] }[] = [
  { key: 'schedule', label: 'Bookings (Schedule)', needles: ['schedule'] },
  { key: 'purchase', label: 'Purchases', needles: ['purchase'] },
  { key: 'lead', label: 'Leads', needles: ['lead'] },
  { key: 'initiate_checkout', label: 'Checkouts started', needles: ['initiate_checkout', 'initiatecheckout'] },
]

interface RawAction {
  action_type: string
  value: string
}

interface RawInsightRow {
  campaign_name?: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  actions?: RawAction[]
}

export interface ConversionStat {
  key: string
  label: string
  count: number
  costPer: number | null // spend / count, null if count 0
}

export interface AdSummary {
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number // percent
  cpc: number
  cpm: number
  conversions: ConversionStat[]
}

export interface CampaignRow {
  name: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  bookings: number // Schedule conversions, the metric Mark cares about
  costPerBooking: number | null
}

export type AdInsightsResult =
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string }
  | { status: 'ok'; summary: AdSummary; campaigns: CampaignRow[] }

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Sum the value of every action whose type matches any needle. */
function sumActions(actions: RawAction[] | undefined, needles: string[]): number {
  if (!actions) return 0
  let total = 0
  for (const a of actions) {
    const type = a.action_type.toLowerCase()
    if (needles.some((n) => type.includes(n))) total += num(a.value)
  }
  return total
}

async function fetchInsights(level: 'account' | 'campaign', datePreset: DatePreset): Promise<RawInsightRow[]> {
  const fields = ['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'cpm', 'actions']
  if (level === 'campaign') fields.unshift('campaign_name')
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/insights`)
  url.searchParams.set('level', level)
  url.searchParams.set('date_preset', datePreset)
  url.searchParams.set('fields', fields.join(','))
  url.searchParams.set('limit', '100')
  // Server-side brand filter: only campaigns whose name contains the keyword
  // roll up into these numbers — works at account level too, so the summary
  // excludes the other brands sharing this ad account.
  url.searchParams.set(
    'filtering',
    JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: CAMPAIGN_KEYWORD }])
  )
  url.searchParams.set('access_token', TOKEN)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Meta insights ${res.status}: ${text.slice(0, 300)}`)
  }
  const json = (await res.json()) as { data?: RawInsightRow[] }
  return json.data ?? []
}

export async function getAdInsights(datePreset: DatePreset): Promise<AdInsightsResult> {
  const missing: string[] = []
  if (!TOKEN) missing.push('META_ADS_TOKEN')
  if (!AD_ACCOUNT_ID) missing.push('META_AD_ACCOUNT_ID')
  if (missing.length) return { status: 'not_configured', missing }

  try {
    const [accountRows, campaignRows] = await Promise.all([
      fetchInsights('account', datePreset),
      fetchInsights('campaign', datePreset),
    ])

    const acct = accountRows[0]
    const spend = num(acct?.spend)
    const conversions: ConversionStat[] = CONVERSION_MATCHERS.map((m) => {
      const count = sumActions(acct?.actions, m.needles)
      return {
        key: m.key,
        label: m.label,
        count,
        costPer: count > 0 ? spend / count : null,
      }
    })

    const summary: AdSummary = {
      spend,
      impressions: num(acct?.impressions),
      reach: num(acct?.reach),
      clicks: num(acct?.clicks),
      ctr: num(acct?.ctr),
      cpc: num(acct?.cpc),
      cpm: num(acct?.cpm),
      conversions,
    }

    const campaigns: CampaignRow[] = campaignRows
      .map((c) => {
        const cSpend = num(c.spend)
        const bookings = sumActions(c.actions, ['schedule'])
        return {
          name: c.campaign_name ?? '(unnamed)',
          spend: cSpend,
          impressions: num(c.impressions),
          clicks: num(c.clicks),
          ctr: num(c.ctr),
          bookings,
          costPerBooking: bookings > 0 ? cSpend / bookings : null,
        }
      })
      .sort((a, b) => b.spend - a.spend)

    return { status: 'ok', summary, campaigns }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
