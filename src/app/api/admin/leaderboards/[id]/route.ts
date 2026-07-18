// PATCH  /api/admin/leaderboards/[id] — rename / set period / set active.
// DELETE /api/admin/leaderboards/[id] — delete the board (entries cascade).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type BoardUpdate = Database['public']['Tables']['leaderboards']['Update']

export const runtime = 'nodejs'

interface Body {
  trackName?: string
  periodLabel?: string | null
  isActive?: boolean
}

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
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { id } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Setting this board active means unsetting whichever one currently is (the
  // partial unique index allows only one). Do it first so the update can't clash.
  if (body.isActive === true) {
    await supabase
      .from('leaderboards')
      .update({ is_active: false })
      .eq('is_active', true)
      .neq('id', id)
  }

  const patch: BoardUpdate = {}
  if (typeof body.trackName === 'string') {
    const t = body.trackName.trim()
    if (!t) return NextResponse.json({ success: false, error: 'Track name cannot be empty.' }, { status: 400 })
    patch.track_name = t
  }
  if (body.periodLabel !== undefined) {
    patch.period_label = (body.periodLabel ?? '').toString().trim() || null
  }
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: true }) // nothing to change
  }

  const { error } = await supabase.from('leaderboards').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { id } = await params

  const supabase = createAdminClient()
  const { error } = await supabase.from('leaderboards').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
