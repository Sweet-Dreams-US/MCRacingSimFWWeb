// POST /api/admin/availability — create an availability block (whole day or a
// time window) so online booking refuses those slots.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  toExtendedMinutes,
  windowsConflict,
  blockConflictsWithBooking,
} from '@/lib/availability'

export const runtime = 'nodejs'

/** "13:30:00" | "13:30" → "1:30 PM" for friendly conflict messages. */
function fmt12(t: string | null): string {
  if (!t) return 'the whole day'
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const m = mStr ?? '00'
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${period}`
}

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

  // No overlapping reservations. Reject a block that would collide with an
  // existing block OR a live booking on the same day, so two reservations can
  // never silently sit on the same sims. (Cancelled / no-show / stale-pending
  // bookings don't count — same active set the public picker uses.)
  //
  // This is a read-then-insert check, not a DB constraint, so two truly
  // simultaneous submissions (same date, same instant) could still both pass.
  // Acceptable here: admin write volume is tiny (1–2 staff, sequential entry),
  // and the worst case is a redundant block an admin can delete — the
  // customer-facing seat/block enforcement still prevents over-capacity
  // *online* bookings regardless.
  const newWindow = { startTime, endTime }
  const [existingBlocksRes, bookingsRes] = await Promise.all([
    supabase.from('availability_blocks').select('start_time, end_time').eq('block_date', blockDate),
    supabase
      .from('bookings')
      .select('start_time, duration_hours, racer_count, status, created_at')
      .eq('session_date', blockDate)
      .in('status', ['confirmed', 'completed', 'partial_noshow', 'pending']),
  ])
  if (existingBlocksRes.error || bookingsRes.error) {
    return NextResponse.json(
      { success: false, error: 'Could not check for conflicts — please try again.' },
      { status: 500 }
    )
  }

  const clashBlock = (existingBlocksRes.data ?? []).find((b) =>
    windowsConflict(newWindow, { startTime: b.start_time, endTime: b.end_time })
  )
  if (clashBlock) {
    return NextResponse.json(
      {
        success: false,
        error: `That overlaps an existing block (${fmt12(clashBlock.start_time)} – ${fmt12(
          clashBlock.end_time
        )}). Remove or adjust that block first.`,
      },
      { status: 409 }
    )
  }

  const pendingCutoff = Date.now() - 30 * 60 * 1000
  const activeBookings = (bookingsRes.data ?? []).filter(
    (b) => b.status !== 'pending' || new Date(b.created_at).getTime() >= pendingCutoff
  )
  const clashBooking = activeBookings.find((b) =>
    blockConflictsWithBooking(newWindow, {
      startTime: b.start_time,
      durationHours: b.duration_hours,
      racerCount: b.racer_count,
    })
  )
  if (clashBooking) {
    return NextResponse.json(
      {
        success: false,
        error: `That overlaps a booking already on the schedule (starts ${fmt12(
          clashBooking.start_time
        )}, ${clashBooking.duration_hours}h). Cancel or reschedule that booking first, or pick a non-overlapping time.`,
      },
      { status: 409 }
    )
  }

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
