// POST /api/terminal/create_booking
// "Add booking — no sale yet" from the reader: put a session on the books now
// and charge it later (staff picks it off the bookings list when they pay).
//
// Reuses createInviteBooking so the reader and the admin panel share one code
// path. With no customerId/email this creates a bare slot block (no customer,
// no emails) — the common counter case. Device-key auth.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'
import { createInviteBooking } from '@/lib/booking'
import { getDayType } from '@/lib/pricing'

export const runtime = 'nodejs'

interface Body {
  sessionDate?: string // "YYYY-MM-DD"
  startTime?: string // "HH:MM" 24-hour
  durationHours?: number
  racerCount?: number
  priceCents?: number
  // Optional: attach a known customer (e.g. picked from recent liability forms).
  customerId?: string | null
  notes?: string
  // Reader default is quiet — staff is standing with the customer.
  sendCustomerEmail?: boolean
}

function asUnit(v: unknown, fallback: 1 | 2 | 3): 1 | 2 | 3 {
  const n = typeof v === 'number' ? v : NaN
  return n === 1 || n === 2 || n === 3 ? n : fallback
}

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const sessionDate = (body.sessionDate ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json({ success: false, error: 'Date must be YYYY-MM-DD' }, { status: 400 })
  }
  const startTime = (body.startTime ?? '').trim()
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json(
      { success: false, error: 'Start time must be HH:MM (24-hour)' },
      { status: 400 }
    )
  }
  if (getDayType(sessionDate) === 'closed') {
    return NextResponse.json(
      { success: false, error: 'The venue is normally closed that day.' },
      { status: 400 }
    )
  }

  // If staff picked a customer (e.g. off the recent-liability list), look up
  // their email so the booking links to them rather than creating a duplicate.
  let email: string | undefined
  let firstName: string | undefined
  let lastName: string | undefined
  const customerId = (body.customerId ?? '').trim() || null
  if (customerId) {
    const supabase = createAdminClient()
    const { data: customer } = await supabase
      .from('customers')
      .select('email, first_name, last_name')
      .eq('id', customerId)
      .maybeSingle()
    if (customer) {
      email = customer.email ?? undefined
      firstName = customer.first_name || undefined
      lastName = customer.last_name || undefined
    }
  }

  try {
    const result = await createInviteBooking({
      email,
      firstName,
      lastName,
      sessionDate,
      startTime,
      durationHours: asUnit(body.durationHours, 1),
      racerCount: asUnit(body.racerCount, 1),
      priceCents:
        typeof body.priceCents === 'number' && body.priceCents >= 0
          ? Math.round(body.priceCents)
          : undefined,
      notes: body.notes?.trim() || undefined,
      // Staff is standing with the customer — don't spam them unless asked.
      sendCustomerEmail: body.sendCustomerEmail === true,
    })
    return NextResponse.json({ success: true, bookingId: result.bookingId })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Could not create booking' },
      { status: 500 }
    )
  }
}
