// POST /api/booking/seat-check
// Called by the card form the instant the customer presses "Save Card", before
// the card goes to Stripe. Whoever's card saves first gets the seats: if another
// booking confirmed into this slot while this customer was typing, we answer
// 409 and the card is never saved. Read-only — the race-proof decision is made
// in the database when the card actually lands (confirm_booking_if_seats_free).
import { NextRequest, NextResponse } from 'next/server'
import { checkSeatsBeforeCardSave } from '@/lib/booking'

export async function POST(request: NextRequest) {
  let bookingId: unknown
  try {
    ;({ bookingId } = (await request.json()) as { bookingId?: unknown })
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 })
  }
  if (typeof bookingId !== 'string' || bookingId.length === 0 || bookingId.length > 64) {
    return NextResponse.json({ ok: false, error: 'Missing bookingId' }, { status: 400 })
  }

  try {
    const result = await checkSeatsBeforeCardSave(bookingId)
    if (result.ok) return NextResponse.json({ ok: true })
    return NextResponse.json(
      { ok: false, reason: result.reason, error: result.message },
      { status: result.reason === 'not_found' ? 404 : 409 }
    )
  } catch (err) {
    console.error(`seat-check failed for ${bookingId}:`, err)
    // 503 = "couldn't check". The form lets the card through in that case;
    // the database gate still stops an overbooking when the card lands.
    return NextResponse.json({ ok: false, error: 'Seat check unavailable' }, { status: 503 })
  }
}
