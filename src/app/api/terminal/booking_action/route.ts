// POST /api/terminal/booking_action
// Situational booking updates the reader can make: close out (complete),
// no-show, cancel, or append a note. Device-key auth.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'
import { onBookingCompleted } from '@/lib/booking'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

type BookingStatus = Database['public']['Enums']['booking_status']

interface Body {
  bookingId?: string
  action?: 'complete' | 'noshow' | 'cancel' | 'note'
  note?: string
}

const STATUS_FOR: Record<string, BookingStatus> = {
  complete: 'completed',
  noshow: 'noshow',
  cancel: 'cancelled',
}

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const bookingId = (body.bookingId ?? '').trim()
  const action = body.action
  if (!bookingId || !action) {
    return NextResponse.json(
      { success: false, error: 'bookingId and action are required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  if (action === 'note') {
    const note = (body.note ?? '').trim()
    if (!note) {
      return NextResponse.json({ success: false, error: 'Note is empty' }, { status: 400 })
    }
    const { data: b } = await supabase
      .from('bookings')
      .select('notes')
      .eq('id', bookingId)
      .maybeSingle()
    if (!b) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }
    const stamped = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const next = b.notes ? `${b.notes}\n[${stamped}] ${note}` : `[${stamped}] ${note}`
    const { error } = await supabase.from('bookings').update({ notes: next }).eq('id', bookingId)
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  const status = STATUS_FOR[action]
  if (!status) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // Closing out a session fires the thank-you email + (on a first-ever
  // completion) the customer's referral code. Idempotent + best-effort, so a
  // re-tap won't double-send and a mail hiccup won't fail the close-out.
  if (status === 'completed') {
    await onBookingCompleted(bookingId)
  }

  return NextResponse.json({ success: true, status })
}
