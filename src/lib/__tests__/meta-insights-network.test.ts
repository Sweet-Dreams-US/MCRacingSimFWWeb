import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// insights.ts reads its token / ad account / keywords from the environment at
// IMPORT time, so every test sets the env first and then loads a fresh copy.
async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const k of ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_CAMPAIGN_KEYWORD']) {
    if (env[k] === undefined) delete process.env[k]
    else process.env[k] = env[k]
  }
  return await import('../meta/insights')
}

const ACCOUNT = '1948835248854581'
const BASE_ENV = { META_ADS_TOKEN: 'test-token', META_AD_ACCOUNT_ID: ACCOUNT }

const SEPT_ROW = {
  campaign_id: '120246526770430665',
  campaign_name: 'MC Racing August Traffic Campaign',
  spend: '274.84',
  impressions: '41000',
  clicks: '820',
  date_start: '2026-09-01',
  date_stop: '2026-09-30',
}

interface Call {
  url: URL
}

/** Install a fetch that answers by URL shape, recording every call. */
function mockGraph(handlers: {
  campaigns?: (keyword: string, url: URL) => unknown
  reach?: (url: URL) => { status?: number; body: unknown }
  account?: () => { status?: number; body: unknown }
}) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push({ url })
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

    if (url.pathname.endsWith('/insights')) {
      if (url.searchParams.get('level') === 'account') {
        const r = handlers.reach?.(url) ?? { body: { data: [{ reach: '9000' }] } }
        return json(r.status ?? 200, r.body)
      }
      const filter = JSON.parse(url.searchParams.get('filtering') ?? '[]')[0]
      return json(200, handlers.campaigns?.(filter.value, url) ?? { data: [] })
    }
    const r = handlers.account?.() ?? {
      body: { name: 'Sweet Dreams Music', account_status: 1, currency: 'USD', timezone_name: 'America/New_York' },
    }
    return json(r.status ?? 200, r.body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

beforeEach(() => vi.unstubAllGlobals())
afterEach(() => vi.unstubAllGlobals())

describe('getAdInsights', () => {
  it('reports September MC Racing spend and the account it came from', async () => {
    const { calls } = mockGraph({
      campaigns: (kw) => (kw === 'MC Racing' ? { data: [SEPT_ROW] } : { data: [] }),
    })
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('last_month')

    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.summary.spend).toBeCloseTo(274.84, 2)
    expect(r.campaigns.map((c) => c.name)).toEqual(['MC Racing August Traffic Campaign'])
    expect(r.period).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(r.summary.reach).toBe(9000)
    expect(r.account).toMatchObject({ name: 'Sweet Dreams Music', statusLabel: 'Active', healthy: true })

    // Asked Meta for the real calendar month, once per accepted spelling.
    const campaignCalls = calls.filter((c) => c.url.searchParams.get('level') === 'campaign')
    expect(campaignCalls).toHaveLength(2)
    for (const c of campaignCalls) expect(c.url.searchParams.get('date_preset')).toBe('last_month')
    const keywords = campaignCalls.map((c) => JSON.parse(c.url.searchParams.get('filtering')!)[0].value)
    expect(keywords.sort()).toEqual(['MC Racing', 'MCRacing'])
  })

  it('counts a campaign once even when both spellings return it', async () => {
    mockGraph({ campaigns: () => ({ data: [SEPT_ROW] }) }) // every keyword returns the same row
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('last_month')
    expect(r.status === 'ok' && r.summary.spend).toBeCloseTo(274.84, 2)
    expect(r.status === 'ok' && r.campaigns).toHaveLength(1)
  })

  it('follows pagination instead of stopping at the first page', async () => {
    const second = { ...SEPT_ROW, campaign_id: '2', campaign_name: 'MC Racing July Sales Campaign', spend: '299.38' }
    const { fetchMock } = mockGraph({
      campaigns: (kw, url) => {
        if (kw !== 'MC Racing') return { data: [] }
        return url.searchParams.get('after')
          ? { data: [second] }
          : { data: [SEPT_ROW], paging: { next: `${url.origin}${url.pathname}?${url.searchParams}&after=CURSOR` } }
      },
    })
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('maximum')
    expect(r.status === 'ok' && r.campaigns).toHaveLength(2)
    expect(r.status === 'ok' && r.summary.spend).toBeCloseTo(574.22, 2)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4) // 2 campaign pages + other keyword + reach + account
  })

  it('shows reach as unknown (null) rather than wrong when Meta will not give it', async () => {
    mockGraph({
      campaigns: (kw) => (kw === 'MC Racing' ? { data: [SEPT_ROW] } : { data: [] }),
      reach: () => ({ status: 400, body: { error: { message: 'unsupported filter' } } }),
    })
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('last_month')
    expect(r.status).toBe('ok') // a reach failure must not blank the page
    expect(r.status === 'ok' && r.summary.reach).toBeNull()
    expect(r.status === 'ok' && r.summary.spend).toBeCloseTo(274.84, 2)
  })

  it('surfaces a closed ad account instead of silently showing no spend', async () => {
    mockGraph({
      campaigns: () => ({ data: [] }),
      account: () => ({ body: { name: 'Old Account', account_status: 101, currency: 'USD' } }),
    })
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('last_month')
    expect(r.status === 'ok' && r.account).toMatchObject({ statusLabel: 'Closed', healthy: false })
    expect(r.status === 'ok' && r.summary.spend).toBe(0)
  })

  it('returns an error result (never throws) when Meta rejects the call', async () => {
    // An expired token is HTTP 400 with Graph error code 190 in the body.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"error":{"message":"Session has expired","code":190}}', { status: 400 })
      )
    )
    const { getAdInsights } = await load(BASE_ENV)
    const r = await getAdInsights('last_month')
    expect(r.status).toBe('error')
    expect(r.status === 'error' && r.message).toMatch(/Meta insights 400.*Session has expired/)
    // The access token must never leak into a message shown on the page.
    expect(r.status === 'error' && r.message).not.toContain('test-token')
  })

  it('reports exactly which settings are missing', async () => {
    mockGraph({})
    const { getAdInsights } = await load({})
    expect(await getAdInsights('last_month')).toEqual({
      status: 'not_configured',
      missing: ['META_ADS_TOKEN', 'META_AD_ACCOUNT_ID'],
    })
  })

  it('tolerates an ad account id pasted with its act_ prefix', async () => {
    const { calls } = mockGraph({ campaigns: () => ({ data: [SEPT_ROW] }) })
    const { getAdInsights } = await load({ ...BASE_ENV, META_AD_ACCOUNT_ID: `act_${ACCOUNT}` })
    await getAdInsights('last_month')
    const paths = calls.map((c) => c.url.pathname)
    expect(paths.every((p) => p.includes(`/act_${ACCOUNT}`))).toBe(true)
    expect(paths.some((p) => p.includes('act_act_'))).toBe(false)
  })

  it('honours a custom keyword list from the environment', async () => {
    const { calls } = mockGraph({ campaigns: () => ({ data: [] }) })
    const { getAdInsights, campaignKeywords } = await load({
      ...BASE_ENV,
      META_CAMPAIGN_KEYWORD: 'MC Racing, MC Sim',
    })
    await getAdInsights('last_month')
    expect(campaignKeywords).toEqual(['MC Racing', 'MC Sim'])
    const sent = calls
      .filter((c) => c.url.searchParams.get('level') === 'campaign')
      .map((c) => JSON.parse(c.url.searchParams.get('filtering')!)[0].value)
    expect(sent.sort()).toEqual(['MC Racing', 'MC Sim'])
  })
})
