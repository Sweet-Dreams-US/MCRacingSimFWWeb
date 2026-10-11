import { describe, it, expect, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }))
vi.mock('@supabase/supabase-js', () => ({ createClient }))
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SECRET_KEY = 'sb_secret_test'
import { createAdminClient } from '../supabase/admin'

describe('createAdminClient', () => {
  it('never lets the Next.js fetch cache answer a database read', async () => {
    createAdminClient()
    const opts = (createClient.mock.calls[0] as unknown[])[2] as { global: { fetch: typeof fetch } }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'))
    await opts.global.fetch('https://example.supabase.co/rest/v1/bookings', { method: 'GET', headers: { a: 'b' } })
    expect(spy.mock.calls[0][1]).toMatchObject({ cache: 'no-store', method: 'GET', headers: { a: 'b' } })
    spy.mockRestore()
  })
})
