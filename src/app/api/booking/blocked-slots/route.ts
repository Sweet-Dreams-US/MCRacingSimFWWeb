// GET /api/booking/blocked-slots?date=YYYY-MM-DD
// Public endpoint the booking widget uses to grey out unavailable times:
//   - admin availability blocks (returned as `blocks`)
//   - seats already booked at each time (returned as `bookings` + `capacity`),
//     so the picker can grey a slot only when the requested racers won't fit.
// Returns only times/counts — never customer info or the internal block reason.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_SEAT_CAPACITY } from '@/lib/availability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function seatCapacity(): number {
  const n = Number(process.env.SEAT_CAPACITY)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SEAT_CAPACITY
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { success: false, error: 'date must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const [blocksRes, bookingsRes] = await Promise.all([
    supabase.from('availability_blocks').select('start_time, end_time').eq('block_date', date),
    // Seats occupied on this date: only CONFIRMED reservations. A 'pending'
    // booking is a customer still in checkout with no card saved — it does NOT
    // hold the slot (whoever finishes first gets it). Admin/staff card-less
    // bookings are 'confirmed', so they still block.
    supabase
      .from('bookings')
      .select('start_time, duration_hours, racer_count, status')
      .eq('session_date', date)
      .in('status', ['confirmed', 'completed', 'partial_noshow']),
  ])

  if (blocksRes.error || bookingsRes.error) {
    return NextResponse.json(
      { success: false, error: 'Could not load availability' },
      { status: 500 }
    )
  }

  const bookings = (bookingsRes.data ?? []).map((b) => ({
    startTime: b.start_time, // "HH:MM:SS"
    durationHours: b.duration_hours,
    racerCount: b.racer_count,
  }))

  return NextResponse.json({
    success: true,
    blocks: (blocksRes.data ?? []).map((b) => ({
      startTime: b.start_time, // "HH:MM:SS" or null (null = whole day)
      endTime: b.end_time,
    })),
    bookings,
    capacity: seatCapacity(),
  })
}
