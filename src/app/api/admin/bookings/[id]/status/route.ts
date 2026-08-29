// PATCH /api/admin/bookings/[id]/status
// Cancel a booking, or reopen one that was closed out by mistake.
//
// Exists because there was previously NO way to undo a mis-tapped "Mark
// complete": the reader hides its Cancel button once a booking is closed and
// points staff at the admin site, which had no such control.
//
// The work lives in setBookingStatus() (src/lib/booking.ts), shared with the
// reader's /api/terminal/booking_action so the two can't drift.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import {
  setBookingStatus,
  BookingStatusError,
  type BookingStatusAction,
} from '@/lib/booking'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params

  let action: BookingStatusAction
  let reason: string | null = null
  let acknowledgePaid = false
  try {
    const body = (await request.json()) as {
      action?: string
      reason?: string
      acknowledgePaid?: boolean
    }
    if (body.action !== 'cancel' && body.action !== 'reopen') {
      return NextResponse.json(
        { success: false, error: "action must be 'cancel' or 'reopen'" },
        { status: 400 }
      )
    }
    action = body.action
    reason = body.reason?.trim() || null
    acknowledgePaid = body.acknowledgePaid === true
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const result = await setBookingStatus(id, action, {
      actorUserId: adminCtx.admin.id,
      reason,
      acknowledgePaid,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BookingStatusError) {
      // 'paid' is a confirmable warning, not a hard failure — the UI re-sends
      // with acknowledgePaid once the operator has seen the amount.
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          code: err.code,
          paidCents: err.paidCents,
          needsAcknowledge: err.code === 'paid',
        },
        { status: err.code === 'not_found' ? 404 : 409 }
      )
    }
    const message = err instanceof Error ? err.message : 'Status change failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
