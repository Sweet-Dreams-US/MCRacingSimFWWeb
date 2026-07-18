// PATCH  /api/admin/leaderboards/[id]/entries/[entryId] — correct a time/name.
// DELETE /api/admin/leaderboards/[id]/entries/[entryId] — remove an entry.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLapTimeMs } from '@/lib/laptime'
import type { Database } from '@/lib/supabase/types'

type EntryUpdate = Database['public']['Tables']['leaderboard_entries']['Update']

export const runtime = 'nodejs'

async function auth() {
  try {
    await requireAdmin(['owner', 'staff'])
    return null
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { entryId } = await params

  let body: { time?: string; displayName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: EntryUpdate = { updated_at: new Date().toISOString() }
  if (typeof body.time === 'string') {
    const ms = parseLapTimeMs(body.time)
    if (ms === null) {
      return NextResponse.json(
        { success: false, error: 'Enter a lap time like 1:23.456 or 83.456.' },
        { status: 400 }
      )
    }
    patch.time_ms = ms
  }
  if (typeof body.displayName === 'string') {
    const n = body.displayName.trim()
    if (!n) return NextResponse.json({ success: false, error: 'A name is required.' }, { status: 400 })
    patch.display_name = n
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('leaderboard_entries').update(patch).eq('id', entryId)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { entryId } = await params

  const supabase = createAdminClient()
  const { error } = await supabase.from('leaderboard_entries').delete().eq('id', entryId)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
