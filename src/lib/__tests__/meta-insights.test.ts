import { describe, it, expect } from 'vitest'
import { easternMonthStartUtc } from '../eastern'
import { presetWindow, DATE_PRESETS } from '../meta/date-presets'
import {
  parseKeywords,
  mergeCampaignRows,
  summarizeCampaignRows,
  describeAccountStatus,
  type RawInsightRow,
} from '../meta/insights'

// Real figures read from the Sweet Dreams Music ad account on 2026-10-09.
// September (preset last_month): only ONE MC Racing campaign spent anything.
const SEPTEMBER: RawInsightRow[] = [
  {
    campaign_id: '120246526770430665',
    campaign_name: 'MC Racing August Traffic Campaign',
    spend: '274.84',
    impressions: '41000',
    clicks: '820',
    date_start: '2026-09-01',
    date_stop: '2026-09-30',
  },
]
// All time: the three MC Racing campaigns. (Sweet Dreams' own campaigns — about
// $4,081 more in the same account — are excluded by the name filter on Meta's
// side and never reach this code.)
const ALL_TIME: RawInsightRow[] = [
  { campaign_id: '1', campaign_name: 'MC Racing August Traffic Campaign', spend: '556.72', impressions: '90000', clicks: '1700' },
  { campaign_id: '2', campaign_name: 'MC Racing July Sales Campaign', spend: '299.38', impressions: '30000', clicks: '640' },
  { campaign_id: '3', campaign_name: 'MC Racing 4th July Campaign', spend: '39.86', impressions: '4000', clicks: '90' },
]

describe('summarizeCampaignRows', () => {
  it('September MC Racing spend is $274.84', () => {
    const { summary, campaigns } = summarizeCampaignRows(SEPTEMBER)
    expect(summary.spend).toBeCloseTo(274.84, 2)
    expect(campaigns).toHaveLength(1)
  })

  it('all-time MC Racing spend is $895.96', () => {
    expect(summarizeCampaignRows(ALL_TIME).summary.spend).toBeCloseTo(895.96, 2)
  })

  it('the headline total ALWAYS equals the sum of the table rows', () => {
    // The point of deriving both from one list: they cannot disagree.
    const { summary, campaigns } = summarizeCampaignRows(ALL_TIME)
    const tableTotal = campaigns.reduce((sum, c) => sum + c.spend, 0)
    expect(summary.spend).toBeCloseTo(tableTotal, 6)
  })

  it('sorts campaigns by spend, biggest first', () => {
    const { campaigns } = summarizeCampaignRows(ALL_TIME)
    expect(campaigns.map((c) => c.name)).toEqual([
      'MC Racing August Traffic Campaign',
      'MC Racing July Sales Campaign',
      'MC Racing 4th July Campaign',
    ])
  })

  it('derives rates from the sums, and survives zero activity', () => {
    const { summary } = summarizeCampaignRows(SEPTEMBER)
    expect(summary.ctr).toBeCloseTo((820 / 41000) * 100, 6)
    expect(summary.cpc).toBeCloseTo(274.84 / 820, 6)
    const empty = summarizeCampaignRows([])
    expect(empty.summary).toMatchObject({ spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0 })
    expect(empty.campaigns).toEqual([])
  })

  it('counts Schedule conversions across campaigns and prices them', () => {
    const rows: RawInsightRow[] = [
      { campaign_id: 'a', campaign_name: 'MC Racing A', spend: '100', actions: [{ action_type: 'offsite_conversion.fb_pixel_schedule', value: '4' }] },
      { campaign_id: 'b', campaign_name: 'MC Racing B', spend: '50', actions: [{ action_type: 'schedule', value: '1' }] },
    ]
    const { summary, campaigns } = summarizeCampaignRows(rows)
    const schedule = summary.conversions.find((c) => c.key === 'schedule')!
    expect(schedule.count).toBe(5)
    expect(schedule.costPer).toBeCloseTo(30, 6) // $150 / 5
    expect(campaigns.find((c) => c.name === 'MC Racing A')!.costPerBooking).toBeCloseTo(25, 6)
  })
})

describe('mergeCampaignRows', () => {
  it('counts a campaign once when both name spellings return it', () => {
    // "MC Racing" and "MCRacing" requests can both match one campaign.
    const merged = mergeCampaignRows([ALL_TIME, ALL_TIME.slice(0, 2)])
    expect(merged).toHaveLength(3)
    expect(summarizeCampaignRows(merged).summary.spend).toBeCloseTo(895.96, 2)
  })

  it('keeps campaigns that only one spelling found', () => {
    const merged = mergeCampaignRows([
      [{ campaign_id: '1', campaign_name: 'MC Racing X', spend: '10' }],
      [{ campaign_id: '2', campaign_name: 'MCRacing Y', spend: '5' }],
    ])
    expect(merged.map((r) => r.campaign_id)).toEqual(['1', '2'])
  })
})

describe('parseKeywords', () => {
  it('splits, trims, drops blanks and case-insensitive duplicates', () => {
    expect(parseKeywords(' MC Racing, MCRacing ,, mc racing ')).toEqual(['MC Racing', 'MCRacing'])
  })
  it('returns nothing for empty input so the default can apply', () => {
    expect(parseKeywords(undefined)).toEqual([])
    expect(parseKeywords('  ,  ')).toEqual([])
  })
})

describe('describeAccountStatus', () => {
  it('only an Active account is healthy', () => {
    expect(describeAccountStatus(1)).toEqual({ label: 'Active', healthy: true })
    expect(describeAccountStatus(101)).toEqual({ label: 'Closed', healthy: false })
    expect(describeAccountStatus(3).healthy).toBe(false)
    expect(describeAccountStatus(999).label).toBe('Status 999')
  })
})

// ---------------------------------------------------------------------------
// Date windows
// ---------------------------------------------------------------------------
describe('easternMonthStartUtc', () => {
  it('is 04:00Z in daylight time and 05:00Z in standard time', () => {
    expect(easternMonthStartUtc(2026, 9).toISOString()).toBe('2026-09-01T04:00:00.000Z') // EDT
    expect(easternMonthStartUtc(2026, 12).toISOString()).toBe('2026-12-01T05:00:00.000Z') // EST
    expect(easternMonthStartUtc(2026, 3).toISOString()).toBe('2026-03-01T05:00:00.000Z') // before DST starts (Mar 8)
    expect(easternMonthStartUtc(2026, 4).toISOString()).toBe('2026-04-01T04:00:00.000Z') // after
    expect(easternMonthStartUtc(2026, 11).toISOString()).toBe('2026-11-01T04:00:00.000Z') // DST ends 2am Nov 1 — midnight is still EDT
  })
})

describe('presetWindow', () => {
  const now = new Date('2026-10-09T15:00:00Z') // Oct 9, 11am in Fort Wayne

  it('last_month is exactly September, with an exclusive upper bound', () => {
    const w = presetWindow('last_month', now)
    expect(w.since?.toISOString()).toBe('2026-09-01T04:00:00.000Z')
    expect(w.until?.toISOString()).toBe('2026-10-01T04:00:00.000Z')
  })

  it('this_month starts at the 1st and has no upper bound', () => {
    const w = presetWindow('this_month', now)
    expect(w.since?.toISOString()).toBe('2026-10-01T04:00:00.000Z')
    expect(w.until).toBeNull()
  })

  it('last_month rolls back across New Year and across the DST boundary', () => {
    const jan = presetWindow('last_month', new Date('2026-01-10T15:00:00Z'))
    expect(jan.since?.toISOString()).toBe('2025-12-01T05:00:00.000Z')
    expect(jan.until?.toISOString()).toBe('2026-01-01T05:00:00.000Z')
    const dec = presetWindow('last_month', new Date('2026-12-05T15:00:00Z'))
    expect(dec.since?.toISOString()).toBe('2026-11-01T04:00:00.000Z') // EDT
    expect(dec.until?.toISOString()).toBe('2026-12-01T05:00:00.000Z') // EST
  })

  it('the first hours of a new month still belong to the old one in Fort Wayne', () => {
    // 03:00Z on Oct 1 is 11pm Sept 30 Eastern, so "this month" is still September.
    const w = presetWindow('this_month', new Date('2026-10-01T03:00:00Z'))
    expect(w.since?.toISOString()).toBe('2026-09-01T04:00:00.000Z')
  })

  it('keeps the rolling presets exactly as they were', () => {
    expect(presetWindow('last_30d', now).since?.toISOString()).toBe('2026-09-09T15:00:00.000Z')
    expect(presetWindow('last_7d', now).since?.toISOString()).toBe('2026-10-02T15:00:00.000Z')
    expect(presetWindow('today', now).since?.toISOString()).toBe('2026-10-08T15:00:00.000Z')
    expect(presetWindow('last_30d', now).until).toBeNull()
  })

  it('all time has no bounds', () => {
    expect(presetWindow('maximum', now)).toEqual({ since: null, until: null })
  })
})

describe('DATE_PRESETS', () => {
  it('offers calendar months alongside the rolling windows', () => {
    const values = DATE_PRESETS.map((p) => p.value)
    expect(values).toContain('this_month')
    expect(values).toContain('last_month')
    // every option must resolve to a window without throwing
    for (const v of values) expect(() => presetWindow(v)).not.toThrow()
  })
})
