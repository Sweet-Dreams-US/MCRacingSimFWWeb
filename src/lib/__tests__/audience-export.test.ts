// Meta Custom Audience seed export.
//
// The load-bearing assertion, as with the Conversions API payload, is the
// NEGATIVE one: no phone number may appear in a file we hand to an ad platform.
// Our 10DLC/A2P disclosure promises we do not share mobile information for
// marketing, and a phone list uploaded for ad targeting is the most literal
// possible breach of that.
import { describe, it, expect } from 'vitest'
import {
  buildCustomerListCsv,
  audienceExportFilename,
  META_LOOKALIKE_MIN_MATCHES,
} from '../marketing/audience-export'

interface FakeRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone?: string | null
  unsubscribe_token: string
  unsubscribed_at: string | null
  email_bounced_at: string | null
  email_complained_at: string | null
}

function row(over: Partial<FakeRow> & { email: string | null }): FakeRow {
  return {
    id: `c-${over.email ?? 'none'}`,
    first_name: 'Test',
    last_name: 'Racer',
    phone: '+12605550134',
    unsubscribe_token: 'tok',
    unsubscribed_at: null,
    email_bounced_at: null,
    email_complained_at: null,
    ...over,
  }
}

/**
 * Stands in for the Supabase admin client. getEmailableAudience() applies its
 * suppression as .is()/.not() filters, so the fake mirrors those semantics
 * rather than returning rows blindly — otherwise these tests would pass even if
 * the real query stopped filtering.
 */
function fakeSupabase(rows: FakeRow[]) {
  const filters: Array<(r: FakeRow) => boolean> = []
  const builder = {
    select: () => builder,
    not: (col: string, op: string) => {
      if (op === 'is') filters.push((r) => (r as unknown as Record<string, unknown>)[col] != null)
      return builder
    },
    is: (col: string) => {
      filters.push((r) => (r as unknown as Record<string, unknown>)[col] == null)
      return builder
    },
    order: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
  }
  return { from: () => builder } as unknown as Parameters<typeof buildCustomerListCsv>[0]
}

const build = (rows: FakeRow[]) => buildCustomerListCsv(fakeSupabase(rows))

describe('customer list export — no phone numbers, ever', () => {
  it('emits a single `email` header and no phone column', async () => {
    const { csv } = await build([row({ email: 'a@example.com' })])
    expect(csv.split('\r\n')[0]).toBe('email')
    expect(csv.toLowerCase()).not.toContain('phone')
  })

  it('never leaks a phone number into the file', async () => {
    const { csv } = await build([
      row({ email: 'a@example.com', phone: '+12605550134' }),
      row({ email: 'b@example.com', phone: '2605550199' }),
    ])
    expect(csv).not.toContain('2605550134')
    expect(csv).not.toContain('2605550199')
    expect(csv).not.toContain('+1')
  })
})

describe('customer list export — suppression', () => {
  it('excludes unsubscribed, bounced, and complained addresses', async () => {
    const { csv, count } = await build([
      row({ email: 'keep@example.com' }),
      row({ email: 'unsub@example.com', unsubscribed_at: '2026-08-01T00:00:00Z' }),
      row({ email: 'bounced@example.com', email_bounced_at: '2026-08-01T00:00:00Z' }),
      row({ email: 'spam@example.com', email_complained_at: '2026-08-01T00:00:00Z' }),
    ])
    expect(count).toBe(1)
    expect(csv).toContain('keep@example.com')
    for (const gone of ['unsub@', 'bounced@', 'spam@']) {
      expect(csv).not.toContain(gone)
    }
  })

  it('drops rows with no usable email', async () => {
    const { count } = await build([
      row({ email: 'good@example.com' }),
      row({ email: null }),
      row({ email: 'not-an-email' }),
    ])
    expect(count).toBe(1)
  })
})

describe('customer list export — normalization', () => {
  it('lowercases and trims, the way Meta normalizes before hashing', async () => {
    const { csv } = await build([row({ email: '  Cole@Example.COM  ' })])
    expect(csv).toContain('cole@example.com')
    expect(csv).not.toContain('Cole@Example.COM')
  })

  it('deduplicates addresses that differ only by case or whitespace', async () => {
    // Families share an inbox in this data; a duplicate row would skew the
    // match rate Meta reports back.
    const { count, csv } = await build([
      row({ email: 'shared@example.com' }),
      row({ email: 'SHARED@example.com' }),
      row({ email: ' shared@example.com ' }),
    ])
    expect(count).toBe(1)
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2) // header + one address
  })

  it('produces CRLF-terminated RFC 4180 output', async () => {
    const { csv } = await build([row({ email: 'a@example.com' })])
    expect(csv).toBe('email\r\na@example.com\r\n')
  })
})

describe('customer list export — lookalike guidance', () => {
  it('flags a seed too small to build a lookalike', async () => {
    const rows = Array.from({ length: 20 }, (_, i) => row({ email: `r${i}@example.com` }))
    const res = await build(rows)
    expect(res.count).toBe(20)
    expect(res.estimatedMatches).toBe(14) // 20 * 0.7
    expect(res.clearsLookalikeFloor).toBe(false)
  })

  it('clears the floor once the estimate reaches Meta’s minimum', async () => {
    const rows = Array.from({ length: 166 }, (_, i) => row({ email: `r${i}@example.com` }))
    const res = await build(rows)
    expect(res.estimatedMatches).toBe(116)
    expect(res.estimatedMatches).toBeGreaterThanOrEqual(META_LOOKALIKE_MIN_MATCHES)
    expect(res.clearsLookalikeFloor).toBe(true)
  })

  it('handles an empty audience without producing a bare header of junk', async () => {
    const res = await build([])
    expect(res.count).toBe(0)
    expect(res.csv).toBe('email\r\n')
    expect(res.clearsLookalikeFloor).toBe(false)
  })
})

describe('audienceExportFilename', () => {
  it('is dated so successive exports do not overwrite each other', () => {
    expect(audienceExportFilename(new Date('2026-08-20T12:00:00Z'))).toBe(
      'mc-racing-customer-list-2026-08-20.csv'
    )
  })
})
