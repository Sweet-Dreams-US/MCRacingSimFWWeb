// GET /api/admin/bookings/search
// Upcoming bookings for the POS booking-selector (today + future, real bookings
// only). Returns the customer joined in one shot so selecting a booking can
// prefill time + customer + price together.
//
// Also designed to be the data source for the future on-reader (S710) app —
// it's a plain authenticated JSON list, no UI coupling.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

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
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }

  const supabase = createAdminClient()
  const today = getTodayEastern()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      id, session_date, start_time, end_time, duration_hours, racer_count,
      session_price_cents, no_show_fee_cents, status, source,
      stripe_payment_method_id,
      customer:customers(id, first_name, last_name, email, phone)
    `
    )
    .gte('session_date', today)
    // Actionable bookings only: hide pending (no-card) and cancelled.
    .in('status', ['confirmed', 'completed', 'partial_noshow'])
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const bookings = (data ?? []).map((b) => {
    const c = Array.isArray(b.customer) ? b.customer[0] ?? null : b.customer
    return {
      id: b.id,
      sessionDate: b.session_date,
      startTime: b.start_time,
      endTime: b.end_time,
      durationHours: b.duration_hours,
      racerCount: b.racer_count,
      sessionPriceCents: b.session_price_cents,
      noShowFeeCents: b.no_show_fee_cents,
      status: b.status,
      source: b.source,
      cardOnFile: Boolean(b.stripe_payment_method_id),
      customer: c
        ? {
            id: c.id,
            name: `${c.first_name} ${c.last_name}`.trim(),
            email: c.email,
            phone: c.phone,
          }
        : null,
    }
  })

  return NextResponse.json({ bookings, today })
}
