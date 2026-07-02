// POST /api/booking/lookup
// Public endpoint for customers to look up their own booking by
// booking number + email. We require BOTH so booking IDs can't be
// enumerated to read other people's bookings.
//
// Returns only safe, customer-facing fields — never Stripe IDs, consent
// metadata, IPs, etc.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface LookupBody {
  bookingId?: string
  email?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LookupBody
  const bookingId = body.bookingId?.trim().toUpperCase()
  const email = body.email?.trim().toLowerCase()

  if (!bookingId || !email) {
    return NextResponse.json(
      { found: false, error: 'Enter both your booking number and email.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: booking, error } = await supabase
    .from('bookings')
    .select(
      `id, session_date, start_time, end_time, duration_hours, racer_count,
       session_price_cents, no_show_fee_cents, status, stripe_payment_method_id,
       customer:customers(first_name, email),
       racers:booking_racers(slot, name)`
    )
    .eq('id', bookingId)
    .maybeSingle()

  // Generic "not found" whether the ID is wrong OR the email doesn't match —
  // don't reveal which, so a guessed ID can't be confirmed without the email.
  if (error || !booking) {
    return NextResponse.json({ found: false })
  }

  const customer = Array.isArray(booking.customer)
    ? booking.customer[0]
    : booking.customer

  if (!customer || customer.email?.toLowerCase() !== email) {
    return NextResponse.json({ found: false })
  }

  // Don't surface incomplete (never-paid) bookings to lookups.
  if (booking.status === 'pending') {
    return NextResponse.json({ found: false })
  }

  const racers = Array.isArray(booking.racers) ? booking.racers : []

  return NextResponse.json({
    found: true,
    booking: {
      id: booking.id,
      sessionDate: booking.session_date,
      startTime: booking.start_time,
      endTime: booking.end_time,
      durationHours: booking.duration_hours,
      racerCount: booking.racer_count,
      sessionPriceCents: booking.session_price_cents,
      noShowFeeCents: booking.no_show_fee_cents,
      status: booking.status,
      cardOnFile: Boolean(booking.stripe_payment_method_id),
      customerFirstName: customer.first_name,
      racers: racers
        .sort((a, b) => a.slot - b.slot)
        .map((r) => ({ slot: r.slot, name: r.name })),
    },
  })
}
