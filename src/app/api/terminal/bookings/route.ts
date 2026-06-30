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
       session_price_cents, status,
       customer:customers(id, first_name, last_name, email, phone)`
    )
    .gte('session_date', today)
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
      durationHours: b.duration_hours,
      racerCount: b.racer_count,
      sessionPriceCents: b.session_price_cents,
      status: b.status,
      customerId: c?.id ?? null,
      customerName: c ? `${c.first_name} ${c.last_name}`.trim() : null,
      customerEmail: c?.email ?? null,
      customerPhone: c?.phone ?? null,
    }
  })

  return NextResponse.json({ bookings, today })
}
