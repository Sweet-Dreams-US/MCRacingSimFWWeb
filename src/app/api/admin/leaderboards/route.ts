// POST /api/admin/leaderboards — create a new leaderboard (a monthly track).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

interface Body {
  trackName?: string
  periodLabel?: string
  makeActive?: boolean
}

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const trackName = (body.trackName ?? '').trim()
  if (!trackName) {
    return NextResponse.json({ success: false, error: 'A track name is required.' }, { status: 400 })
  }
  const periodLabel = (body.periodLabel ?? '').trim() || null
  const makeActive = body.makeActive !== false // default: the newest board is the current one

  const supabase = createAdminClient()

  // Only one board can be active — clear the flag on the others first (the
  // partial unique index would otherwise reject a second active row).
  if (makeActive) {
    await supabase.from('leaderboards').update({ is_active: false }).eq('is_active', true)
  }

  const { data, error } = await supabase
    .from('leaderboards')
    .insert({
      track_name: trackName,
      period_label: periodLabel,
      is_active: makeActive,
      created_by_user_id: adminCtx.admin.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { success: false, error: `Could not create leaderboard: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: data.id })
}
