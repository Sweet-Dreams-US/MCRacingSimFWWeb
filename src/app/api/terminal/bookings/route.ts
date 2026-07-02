// GET /api/terminal/bookings
// Upcoming bookings for the on-reader app's first screen (device-key auth).
// Same data as /api/admin/bookings/search, but authenticated by device key
// rather than an admin session.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'

function getTodayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export async function GET(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = getTodayEastern()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `id, session_date, start_time, duration_hours, racer_count,
       session_price_cents, discount_code, discount_amount_cents, status,
       customer:customers(id, first_name, last_name, email, phone)`
    )
    .gte('session_date', today)
    // Open (confirmed) + closed-out (completed/no-show) so the app can group
    // them into Upcoming vs Past. Cancelled bookings are excluded entirely.
    .in('status', ['confirmed', 'completed', 'partial_noshow', 'noshow'])
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // How much has already been paid toward each booking (base amount, excluding
  // tips; refunds net out via signed amounts). Lets the app show a remaining
  // balance so staff can split a booking across multiple charges.
  const ids = (data ?? []).map((b) => b.id)
  const paidByBooking: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: txns } = await supabase
      .from('transactions')
      .select('booking_id, amount_cents, tip_cents')
      .in('booking_id', ids)
      .is('soft_deleted_at', null)
    for (const t of txns ?? []) {
      if (t.booking_id) {
        paidByBooking[t.booking_id] =
          (paidByBooking[t.booking_id] ?? 0) + (t.amount_cents - (t.tip_cents ?? 0))
      }
    }
  }

  const bookings = (data ?? []).map((b) => {
    const c = Array.isArray(b.customer) ? b.customer[0] ?? null : b.customer
    const discountCents = b.discount_amount_cents ?? 0
    // What staff should actually collect: session price minus any discount the
    // customer applied online. The reader charges against netPriceCents so a
    // 50%-off code is honored at the counter without manual math.
    const netPriceCents = Math.max(0, b.session_price_cents - discountCents)
    return {
      id: b.id,
      sessionDate: b.session_date,
      startTime: b.start_time,
      durationHours: b.duration_hours,
      racerCount: b.racer_count,
      sessionPriceCents: b.session_price_cents,
      discountCode: b.discount_code ?? null,
      discountAmountCents: discountCents,
      netPriceCents,
      paidCents: paidByBooking[b.id] ?? 0,
      status: b.status,
      customerId: c?.id ?? null,
      customerName: c ? `${c.first_name} ${c.last_name}`.trim() : null,
      customerEmail: c?.email ?? null,
      customerPhone: c?.phone ?? null,
    }
  })

  return NextResponse.json({ bookings, today })
}
