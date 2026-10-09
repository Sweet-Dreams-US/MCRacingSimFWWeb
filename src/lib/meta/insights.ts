// src/lib/meta/insights.ts
// Read Meta ad performance for the admin panel. Server-only — uses a Meta
// token with `ads_read` scope (META_ADS_TOKEN) against the configured ad
// account (META_AD_ACCOUNT_ID). Separate from the CAPI token, which only has
// dataset-quality scope and cannot read ad insights.
//
// Never throws: returns a discriminated result the page renders directly, so a
// Meta outage or a missing token shows a friendly state instead of a 500.
//
// SPEND HAS ONE SOURCE OF TRUTH: the campaign rows. The headline Spend,
// Impressions, Clicks and conversion counts are the SUM of the campaigns shown
// in the table beneath them, so the two can never disagree. (They used to come
// from two separate API calls — an account-level rollup and a campaign-level
// list — that were free to drift apart.) Reach is the one exception: unique
// people aren't additive across campaigns, so it is fetched separately and
// shown as "—" if that call fails, rather than as a wrong number.
import { DATE_PRESETS, type DatePreset } from './date-presets'

export { DATE_PRESETS }
export type { DatePreset }

const GRAPH_VERSION = 'v21.0'
const TOKEN = process.env.META_ADS_TOKEN || ''
// Tolerate an "act_" prefix: the URL below adds its own, so a value pasted as
// "act_123…" would otherwise become "act_act_123…" and fail with a confusing error.
const AD_ACCOUNT_ID = (process.env.META_AD_ACCOUNT_ID || '').trim().replace(/^act_/i, '')

/**
 * The ad account is shared across brands (Sweet Dreams Music / Sweet Dreams US /
 * MC Racing), so only campaigns whose NAME contains one of these keywords are
 * counted. Matching happens on Meta's side, so other brands' campaign names and
 * spend never reach this app — that is deliberate, since this page is visible
 * to MC Racing staff. Meta's CONTAIN is case-insensitive.
 *
 * Several spellings are accepted because one typo in a campaign name used to
 * silently drop its spend from the total. Override with META_CAMPAIGN_KEYWORD
 * (comma-separated).
 */
const DEFAULT_KEYWORDS = ['MC Racing', 'MCRacing']

export function parseKeywords(raw: string | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? '').split(',')) {
    const k = part.trim()
    if (!k || seen.has(k.toLowerCase())) continue
    seen.add(k.toLowerCase())
    out.push(k)
  }
  return out
}

export const campaignKeywords: string[] = (() => {
  const parsed = parseKeywords(process.env.META_CAMPAIGN_KEYWORD)
  return parsed.length > 0 ? parsed : DEFAULT_KEYWORDS
})()

/** For display: “MC Racing” or “MCRacing”. The page wraps this in quote marks. */
export const campaignKeyword = campaignKeywords.join('” or “')

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

export interface RawInsightRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  impressions?: string
  reach?: string
  clicks?: string
  actions?: RawAction[]
  date_start?: string
  date_stop?: string
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
  /** null = Meta wouldn't give us a de-duplicated figure; show "—", never a guess. */
  reach: number | null
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

/** Which ad account the numbers came from — so a wrong account is visible, not silent. */
export interface AdAccountInfo {
  id: string
  name: string
  statusLabel: string
  /** False for anything other than a healthy, active account. */
  healthy: boolean
  currency: string | null
  timezone: string | null
}

export type AdInsightsResult =
  | { status: 'not_configured'; missing: string[] }
  | { status: 'error'; message: string }
  | {
      status: 'ok'
      summary: AdSummary
      campaigns: CampaignRow[]
      /** The exact range Meta reported on, e.g. 2026-09-01 → 2026-09-30. Null if there was no activity. */
      period: { start: string; end: string } | null
      account: AdAccountInfo | null
    }

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

// ---------------------------------------------------------------------------
// Pure aggregation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Merge campaign rows fetched under different keywords. A campaign whose name
 * contains BOTH spellings comes back from both requests; count it once.
 */
export function mergeCampaignRows(lists: RawInsightRow[][]): RawInsightRow[] {
  const byKey = new Map<string, RawInsightRow>()
  for (const list of lists) {
    for (const row of list) {
      const key = row.campaign_id ?? `name:${row.campaign_name ?? ''}`
      if (!byKey.has(key)) byKey.set(key, row)
    }
  }
  return Array.from(byKey.values())
}

/** Build the headline summary AND the table from the same rows. */
export function summarizeCampaignRows(rows: RawInsightRow[]): {
  summary: Omit<AdSummary, 'reach'>
  campaigns: CampaignRow[]
} {
  let spend = 0
  let impressions = 0
  let clicks = 0
  const campaigns: CampaignRow[] = []

  for (const r of rows) {
    const cSpend = num(r.spend)
    const cImpressions = num(r.impressions)
    const cClicks = num(r.clicks)
    spend += cSpend
    impressions += cImpressions
    clicks += cClicks

    const bookings = sumActions(r.actions, ['schedule'])
    campaigns.push({
      name: r.campaign_name ?? '(unnamed)',
      spend: cSpend,
      impressions: cImpressions,
      clicks: cClicks,
      ctr: cImpressions > 0 ? (cClicks / cImpressions) * 100 : 0,
      bookings,
      costPerBooking: bookings > 0 ? cSpend / bookings : null,
    })
  }
  campaigns.sort((a, b) => b.spend - a.spend)

  const conversions: ConversionStat[] = CONVERSION_MATCHERS.map((m) => {
    const count = rows.reduce((sum, r) => sum + sumActions(r.actions, m.needles), 0)
    return { key: m.key, label: m.label, count, costPer: count > 0 ? spend / count : null }
  })

  return {
    summary: {
      spend,
      impressions,
      clicks,
      // Rates are derived from the sums so they describe exactly the totals shown.
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      conversions,
    },
    campaigns,
  }
}

const ACCOUNT_STATUS_LABELS: Record<number, string> = {
  1: 'Active',
  2: 'Disabled',
  3: 'Payment issue',
  7: 'Pending review',
  8: 'Pending settlement',
  9: 'In grace period',
  100: 'Pending closure',
  101: 'Closed',
  201: 'Any active',
  202: 'Any closed',
}

export function describeAccountStatus(code: number): { label: string; healthy: boolean } {
  return { label: ACCOUNT_STATUS_LABELS[code] ?? `Status ${code}`, healthy: code === 1 }
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

interface GraphPage {
  data?: RawInsightRow[]
  paging?: { next?: string }
}

/** Follow Meta's pagination to the end — the old fetch stopped at the first 100 rows. */
async function fetchAllRows(firstUrl: string): Promise<RawInsightRow[]> {
  const rows: RawInsightRow[] = []
  let url: string | null = firstUrl
  // 20 pages x 100 is far beyond any plausible campaign count; the cap is only
  // a guard against a paging loop.
  for (let page = 0; page < 20 && url; page++) {
    const res: Response = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Meta insights ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = (await res.json()) as GraphPage
    rows.push(...(json.data ?? []))
    url = json.paging?.next ?? null
  }
  return rows
}

function insightsUrl(level: 'campaign' | 'account', datePreset: DatePreset, fields: string[]): URL {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/insights`)
  url.searchParams.set('level', level)
  url.searchParams.set('date_preset', datePreset)
  url.searchParams.set('fields', fields.join(','))
  url.searchParams.set('limit', '100')
  url.searchParams.set('access_token', TOKEN)
  return url
}

function fetchCampaignRows(keyword: string, datePreset: DatePreset): Promise<RawInsightRow[]> {
  const url = insightsUrl('campaign', datePreset, [
    'campaign_id',
    'campaign_name',
    'spend',
    'impressions',
    'clicks',
    'actions',
    'date_start',
    'date_stop',
  ])
  // Server-side brand filter: only campaigns whose name contains the keyword.
  url.searchParams.set(
    'filtering',
    JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: keyword }])
  )
  return fetchAllRows(url.toString())
}

/** De-duplicated reach for exactly the counted campaigns. Null if Meta won't say. */
async function fetchReach(campaignIds: string[], datePreset: DatePreset): Promise<number | null> {
  if (campaignIds.length === 0) return 0
  try {
    const url = insightsUrl('account', datePreset, ['reach'])
    url.searchParams.set(
      'filtering',
      JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: campaignIds }])
    )
    const rows = await fetchAllRows(url.toString())
    return rows[0] ? num(rows[0].reach) : null
  } catch {
    return null
  }
}

async function fetchAccountInfo(): Promise<AdAccountInfo | null> {
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}`)
    url.searchParams.set('fields', 'name,account_status,currency,timezone_name')
    url.searchParams.set('access_token', TOKEN)
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) return null
    const json = (await res.json()) as {
      name?: string
      account_status?: number
      currency?: string
      timezone_name?: string
    }
    const status = describeAccountStatus(json.account_status ?? -1)
    return {
      id: AD_ACCOUNT_ID,
      name: json.name ?? AD_ACCOUNT_ID,
      statusLabel: status.label,
      healthy: status.healthy,
      currency: json.currency ?? null,
      timezone: json.timezone_name ?? null,
    }
  } catch {
    return null
  }
}

export async function getAdInsights(datePreset: DatePreset): Promise<AdInsightsResult> {
  const missing: string[] = []
  if (!TOKEN) missing.push('META_ADS_TOKEN')
  if (!AD_ACCOUNT_ID) missing.push('META_AD_ACCOUNT_ID')
  if (missing.length) return { status: 'not_configured', missing }

  try {
    const [lists, account] = await Promise.all([
      Promise.all(campaignKeywords.map((k) => fetchCampaignRows(k, datePreset))),
      fetchAccountInfo(),
    ])
    const rows = mergeCampaignRows(lists)
    const { summary, campaigns } = summarizeCampaignRows(rows)

    const ids = rows.map((r) => r.campaign_id).filter((id): id is string => !!id)
    const reach = await fetchReach(ids, datePreset)

    const first = rows.find((r) => r.date_start && r.date_stop)
    return {
      status: 'ok',
      summary: { ...summary, reach },
      campaigns,
      period: first ? { start: first.date_start!, end: first.date_stop! } : null,
      account,
    }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
