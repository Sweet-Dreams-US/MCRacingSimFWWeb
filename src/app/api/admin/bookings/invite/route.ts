// POST /api/admin/bookings/invite
// Admin creates a card-less booking on a customer's behalf. Fires the invite
// email + owner alert + Google Calendar event (and it becomes reminder-eligible).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createInviteBooking } from '@/lib/booking'
import { getDayType } from '@/lib/pricing'

export const runtime = 'nodejs'

interface InviteBody {
  email?: string
  firstName?: string
  lastName?: string
  phone?: string
  sessionDate?: string
  startTime?: string
  durationHours?: number | string
  racerCount?: number | string
  notes?: string
}

function asUnit(v: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN
  return n === 1 || n === 2 || n === 3 ? n : fallback
}

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  let body: InviteBody
  try {
    body = (await request.json()) as InviteBody
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json(
      { success: false, error: 'A valid customer email is required' },
      { status: 400 }
    )
  }

  const sessionDate = (body.sessionDate ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json(
      { success: false, error: 'Date must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  // The venue is closed Mondays — calculatePrice would silently fall through to
  // weekday pricing, so block it here rather than book a closed day at a guessed price.
  if (getDayType(sessionDate) === 'closed') {
    return NextResponse.json(
      { success: false, error: 'The venue is closed on Mondays — pick another date.' },
      { status: 400 }
    )
  }

  const startTime = (body.startTime ?? '').trim()
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json(
      { success: false, error: 'Start time must be HH:MM (24-hour)' },
      { status: 400 }
    )
  }

  // Hours is optional → default 1; racers optional → default 1.
  const durationHours = asUnit(body.durationHours, 1)
  const racerCount = asUnit(body.racerCount, 1)

  try {
    const result = await createInviteBooking({
      email,
      firstName: body.firstName?.trim() || undefined,
      lastName: body.lastName?.trim() || undefined,
      phone: body.phone?.trim() || undefined,
      sessionDate,
      startTime,
      durationHours,
      racerCount,
      notes: body.notes?.trim() || undefined,
      createdByUserId: adminCtx.admin.id,
    })
    return NextResponse.json({ success: true, bookingId: result.bookingId })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Invite failed' },
      { status: 500 }
    )
  }
}
