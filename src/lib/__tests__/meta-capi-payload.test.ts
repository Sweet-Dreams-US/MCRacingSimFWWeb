// What we actually put on the wire to Meta.
//
// The load-bearing assertion here is the NEGATIVE one: no phone number, hashed
// or otherwise, may ever appear in a Conversions API payload. Our SMS program
// runs under a 10DLC/A2P disclosure that promises we do not share mobile
// information with third parties for marketing — so this is a compliance
// guarantee, not a preference. `MetaUserData` has no `phone` field, and this
// test proves the promise holds end to end even if someone widens the type.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

/**
 * capi.ts reads its env at module load, so each case imports a fresh copy with
 * the env already in place (vi.resetModules clears the cache between tests).
 */
async function sendAndCapture(
  ev: Record<string, unknown>,
  env: Record<string, string> = {}
): Promise<{ url: string; body: Record<string, unknown> }> {
  vi.resetModules()
  vi.stubEnv('META_CAPI_TOKEN', env.META_CAPI_TOKEN ?? 'test-token')
  vi.stubEnv('META_DATASET_ID', env.META_DATASET_ID ?? '936045282838979')
  if (env.META_TEST_EVENT_CODE) vi.stubEnv('META_TEST_EVENT_CODE', env.META_TEST_EVENT_CODE)

  let captured: { url: string; body: Record<string, unknown> } | null = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      captured = { url, body: JSON.parse(init.body) }
      return { ok: true, text: async () => '' } as Response
    })
  )

  const { sendMetaEvent } = await import('../meta/capi')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sendMetaEvent(ev as any)
  if (!captured) throw new Error('sendMetaEvent did not call fetch')
  return captured
}

const fullUser = {
  email: '  Cole@Example.COM ',
  firstName: 'Cole',
  lastName: 'Marcuccilli',
  externalId: 'cust-123',
  fbp: 'fb.1.111.9999999999',
  fbc: 'fb.1.222.IwAR9',
  clientIpAddress: '203.0.113.9',
  clientUserAgent: 'Mozilla/5.0',
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('CAPI payload — phone is never sent (10DLC)', () => {
  it('omits `ph` entirely for a fully-populated user', async () => {
    const { body } = await sendAndCapture({
      eventName: 'Schedule',
      eventId: 'sched_MC-COLE0820',
      userData: fullUser,
    })
    const ud = (body.data as Array<Record<string, unknown>>)[0].user_data as Record<string, unknown>
    expect(ud).not.toHaveProperty('ph')
    expect(JSON.stringify(body)).not.toContain('"ph"')
  })

  it('drops a phone even if one is smuggled onto userData at runtime', async () => {
    // Guards the case where the type is widened or a caller casts around it.
    const { body } = await sendAndCapture({
      eventName: 'Schedule',
      userData: { ...fullUser, phone: '+1 260 555 0134' },
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('"ph"')
    // …and the raw number certainly never appears.
    expect(serialized).not.toContain('2605550134')
    expect(serialized).not.toContain(sha256('12605550134'))
  })
})

describe('CAPI payload — advanced matching', () => {
  it('hashes email lowercased and trimmed', async () => {
    const { body } = await sendAndCapture({ eventName: 'Lead', userData: fullUser })
    const ud = (body.data as Array<Record<string, unknown>>)[0].user_data as Record<string, unknown>
    expect(ud.em).toBe(sha256('cole@example.com'))
  })

  it('hashes names and external_id, but never raw values', async () => {
    const { body } = await sendAndCapture({ eventName: 'Lead', userData: fullUser })
    const ud = (body.data as Array<Record<string, unknown>>)[0].user_data as Record<string, unknown>
    expect(ud.fn).toBe(sha256('cole'))
    expect(ud.ln).toBe(sha256('marcuccilli'))
    expect(ud.external_id).toBe(sha256('cust-123'))
    expect(JSON.stringify(body)).not.toContain('Cole@Example.COM')
  })

  it('sends fbp/fbc/IP/UA UNhashed, as Meta requires', async () => {
    const { body } = await sendAndCapture({ eventName: 'Schedule', userData: fullUser })
    const ud = (body.data as Array<Record<string, unknown>>)[0].user_data as Record<string, unknown>
    expect(ud.fbp).toBe('fb.1.111.9999999999')
    expect(ud.fbc).toBe('fb.1.222.IwAR9')
    expect(ud.client_ip_address).toBe('203.0.113.9')
    expect(ud.client_user_agent).toBe('Mozilla/5.0')
  })

  it('omits match keys that were not provided rather than sending empties', async () => {
    const { body } = await sendAndCapture({ eventName: 'Schedule', userData: { email: null } })
    const ud = (body.data as Array<Record<string, unknown>>)[0].user_data as Record<string, unknown>
    expect(ud).toEqual({})
  })
})

describe('CAPI payload — event envelope', () => {
  it('carries the shared event_id so Meta can dedupe the browser pair', async () => {
    const { body } = await sendAndCapture({
      eventName: 'Schedule',
      eventId: 'sched_MC-COLE0820',
      userData: fullUser,
    })
    const ev = (body.data as Array<Record<string, unknown>>)[0]
    expect(ev.event_id).toBe('sched_MC-COLE0820')
    expect(ev.event_name).toBe('Schedule')
    expect(ev.action_source).toBe('website')
    expect(typeof ev.event_time).toBe('number')
  })

  it('adds test_event_code only when META_TEST_EVENT_CODE is set', async () => {
    const plain = await sendAndCapture({ eventName: 'Schedule', userData: fullUser })
    expect(plain.body).not.toHaveProperty('test_event_code')

    const tested = await sendAndCapture(
      { eventName: 'Schedule', userData: fullUser },
      { META_TEST_EVENT_CODE: 'TEST12345' }
    )
    expect(tested.body.test_event_code).toBe('TEST12345')
  })

  it('posts to the configured dataset', async () => {
    const { url } = await sendAndCapture({ eventName: 'Schedule', userData: fullUser })
    expect(url).toContain('/936045282838979/events')
  })
})
