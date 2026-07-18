// POST /api/admin/leaderboards/[id]/entries — add a lap time (auto-keep best).
//
// "Auto-keep best": if this driver is already on the board, we only replace
// their time when the new one is FASTER; a slower time is reported back and
// ignored. A driver is the linked customer (by customer_id) or, for a name-only
// entry, the display name (case-insensitive).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLapTimeMs } from '@/lib/laptime'

export const runtime = 'nodejs'

interface Body {
  customerId?: string | null
  displayName?: string
  time?: string // "1:23.456" | "83.456" | ...
}

type Client = ReturnType<typeof createAdminClient>

// GET — the board's entries, fastest first. The admin manager re-fetches this
// after every add/edit/delete so the ranking is always authoritative.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('id, display_name, time_ms, customer_id')
    .eq('leaderboard_id', id)
    .order('time_ms', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message, entries: [] }, { status: 500 })
  }
  return NextResponse.json({ entries: data ?? [] })
}

/** Find this driver's existing entry on the board, if any. */
async function findExisting(
  supabase: Client,
  leaderboardId: string,
  customerId: string | null,
  displayName: string
) {
  if (customerId) {
    const { data } = await supabase
      .from('leaderboard_entries')
      .select('id, time_ms')
      .eq('leaderboard_id', leaderboardId)
      .eq('customer_id', customerId)
      .maybeSingle()
    return data
  }
  // Name-only: match case-insensitively among the unlinked entries.
  const { data } = await supabase
    .from('leaderboard_entries')
    .select('id, time_ms, display_name')
    .eq('leaderboard_id', leaderboardId)
    .is('customer_id', null)
  const target = displayName.toLowerCase()
  return (data ?? []).find((e) => e.display_name.toLowerCase() === target) ?? null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }

  const { id: leaderboardId } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const timeMs = parseLapTimeMs(body.time ?? '')
  if (timeMs === null) {
    return NextResponse.json(
      { success: false, error: 'Enter a lap time like 1:23.456 or 83.456.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const customerId = (body.customerId ?? '').toString().trim() || null

  // Resolve the display name: what was typed, else derived from the customer as
  // "First L." (last-initial keeps the public board a little more private).
  let displayName = (body.displayName ?? '').trim()
  if (customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select('first_name, last_name')
      .eq('id', customerId)
      .maybeSingle()
    if (!customer) {
      return NextResponse.json({ success: false, error: 'That customer was not found.' }, { status: 400 })
    }
    if (!displayName) {
      const initial = customer.last_name?.trim()?.[0]
      displayName = `${customer.first_name}${initial ? ` ${initial}.` : ''}`.trim()
    }
  }
  if (!displayName) {
    return NextResponse.json({ success: false, error: 'A name is required.' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()

  const apply = async () => {
    const existing = await findExisting(supabase, leaderboardId, customerId, displayName)
    if (existing) {
      if (timeMs < existing.time_ms) {
        const { error } = await supabase
          .from('leaderboard_entries')
          .update({ time_ms: timeMs, display_name: displayName, updated_at: nowIso })
          .eq('id', existing.id)
        if (error) throw error
        return { status: 'improved' as const, previousMs: existing.time_ms }
      }
      return { status: 'kept' as const, keptMs: existing.time_ms }
    }
    const { error } = await supabase.from('leaderboard_entries').insert({
      leaderboard_id: leaderboardId,
      customer_id: customerId,
      display_name: displayName,
      time_ms: timeMs,
      created_by_user_id: adminCtx.admin.id,
    })
    if (error) throw error
    return { status: 'added' as const }
  }

  try {
    const result = await apply()
    return NextResponse.json({ success: true, timeMs, ...result })
  } catch (err) {
    // A concurrent insert for the same driver (the partial unique indexes catch
    // it, code 23505) — re-run against the now-existing row so keep-best holds.
    const code = (err as { code?: string })?.code
    if (code === '23505') {
      try {
        const result = await apply()
        return NextResponse.json({ success: true, timeMs, ...result })
      } catch (e2) {
        return NextResponse.json(
          { success: false, error: (e2 as Error)?.message ?? 'Could not save the time.' },
          { status: 500 }
        )
      }
    }
    if (code === '23503') {
      return NextResponse.json({ success: false, error: 'That leaderboard no longer exists.' }, { status: 404 })
    }
    return NextResponse.json(
      { success: false, error: (err as Error)?.message ?? 'Could not save the time.' },
      { status: 500 }
    )
  }
}
