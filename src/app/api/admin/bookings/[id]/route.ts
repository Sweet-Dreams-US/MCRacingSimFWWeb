// PATCH /api/admin/bookings/[id]
// Admin edits booking details (date, time, duration, racer count, price
// override, notes). All money is recomputed server-side by editBooking() — the
// client price is only honored through the explicit priceOverrideCents field.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { editBooking, BookingEditError, type EditBookingInput } from '@/lib/booking'

export const runtime = 'nodejs'

interface Body {
  sessionDate?: string
  startTime?: string
  durationHours?: number
  racerCount?: number
  priceOverrideCents?: number | null
  notes?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: only owner + staff manage bookings (readonly / sweet_dreams excluded).
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

  const { id: bookingId } = await params

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // Map the wire body to the lib input, coercing numeric fields. Only forward
  // fields that were actually provided so editBooking falls back to current
  // values for the rest.
  const input: EditBookingInput = {}
  if (body.sessionDate !== undefined) input.sessionDate = body.sessionDate
  if (body.startTime !== undefined) input.startTime = body.startTime
  if (body.durationHours !== undefined) input.durationHours = Number(body.durationHours) as 1 | 2 | 3
  if (body.racerCount !== undefined) input.racerCount = Number(body.racerCount) as 1 | 2 | 3
  if (body.notes !== undefined) input.notes = body.notes
  // priceOverrideCents: null clears the override (auto-calc), a number sets it,
  // undefined leaves pricing to recompute from the matrix.
  if (body.priceOverrideCents !== undefined) {
    input.priceOverrideCents =
      body.priceOverrideCents === null ? null : Number(body.priceOverrideCents)
  }

  try {
    const result = await editBooking(bookingId, input, {
      adminUserId: adminCtx.admin.id,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BookingEditError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    console.error(`Booking edit error (${bookingId}):`, err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Edit failed' },
      { status: 500 }
    )
  }
}
