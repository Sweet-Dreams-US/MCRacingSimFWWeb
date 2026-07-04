// POST /api/admin/availability — create an availability block (whole day or a
// time window) so online booking refuses those slots.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { toExtendedMinutes } from '@/lib/availability'

export const runtime = 'nodejs'

interface Body {
  blockDate?: string // "YYYY-MM-DD"
  wholeDay?: boolean
  startTime?: string // "HH:MM" 24-hour venue wall-clock
  endTime?: string // "HH:MM"
  reason?: string | null
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const blockDate = body.blockDate ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(blockDate)) {
    return NextResponse.json(
      { success: false, error: 'Pick a valid date.' },
      { status: 400 }
    )
  }
  // Reject shapes like 2026-13-45 that a regex passes but the DATE column won't.
  const parsed = new Date(`${blockDate}T12:00:00`)
  const [y, m, d] = blockDate.split('-').map(Number)
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== y ||
    parsed.getMonth() + 1 !== m ||
    parsed.getDate() !== d
  ) {
    return NextResponse.json(
      { success: false, error: 'Pick a valid date.' },
      { status: 400 }
    )
  }

  const wholeDay = body.wholeDay === true
  let startTime: string | null = null
  let endTime: string | null = null

  if (!wholeDay) {
    startTime = body.startTime ?? ''
    endTime = body.endTime ?? ''
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      return NextResponse.json(
        { success: false, error: 'Pick a start and end time (or block the whole day).' },
        { status: 400 }
      )
    }
    // Extended-minutes comparison so 11 PM -> 1 AM windows are valid
    // (late-night hours belong to the same session date).
    if (toExtendedMinutes(endTime) <= toExtendedMinutes(startTime)) {
      return NextResponse.json(
        { success: false, error: 'End time must be after the start time.' },
        { status: 400 }
      )
    }
  }

  const supabase = createAdminClient()
  const { data: inserted, error } = await supabase
    .from('availability_blocks')
    .insert({
      block_date: blockDate,
      start_time: startTime,
      end_time: endTime,
      reason: body.reason?.trim() || null,
      created_by_user_id: adminCtx.admin.id,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return NextResponse.json(
      { success: false, error: `Create failed: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: inserted.id })
}
