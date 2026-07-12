// GET /api/cron/complete-booking-reminders
// Runs every ~15 min (Vercel Cron). Sends a friendly "finish your booking"
// nudge to anyone who started an online booking but never saved a card, once
// it's been pending 30+ minutes. Links them to /hold-card/<token> to complete
// it (reusing the require-card flow) — the setup_intent.succeeded webhook then
// confirms the booking. Idempotent via bookings.incomplete_reminder_sent_at.
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { incompleteBookingReminderEmail } from '@/lib/emails/templates'
import { businessDateEastern } from '@/lib/business-day'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Fail CLOSED.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = Date.now()
  const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
  const today = businessDateEastern()

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      `id, session_date, start_time, card_link_token,
       customer:customers(id, first_name, email)`
    )
    .eq('status', 'pending')
    .eq('source', 'online')
    .is('stripe_payment_method_id', null) // never saved a card
    .is('incomplete_reminder_sent_at', null) // not yet reminded
    .gte('session_date', today) // don't nudge for sessions already past
    .lte('created_at', thirtyMinAgo) // waited at least 30 min
    .gte('created_at', threeDaysAgo) // don't nag ancient abandoned carts
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const base = process.env.NEXT_PUBLIC_URL || 'https://www.mcracingfortwayne.com'
  let sent = 0
  let skipped = 0

  for (const b of bookings ?? []) {
    const customer = Array.isArray(b.customer) ? b.customer[0] : b.customer
    if (!customer?.email) {
      skipped++
      continue
    }

    // Don't nudge someone who already has a real booking that same day (they
    // abandoned one attempt but re-booked successfully). Mark handled so we
    // don't re-check them every run.
    const { count: alreadyBooked } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .eq('session_date', b.session_date)
      .in('status', ['confirmed', 'completed', 'partial_noshow', 'noshow'])
    if (alreadyBooked && alreadyBooked > 0) {
      await supabase
        .from('bookings')
        .update({ incomplete_reminder_sent_at: new Date().toISOString() })
        .eq('id', b.id)
      skipped++
      continue
    }

    // Ensure a resume token exists so /hold-card/<token> works.
    let token = b.card_link_token
    if (!token) {
      token = randomUUID()
      const { error: upErr } = await supabase
        .from('bookings')
        .update({ card_link_token: token })
        .eq('id', b.id)
      if (upErr) {
        skipped++
        continue
      }
    }

    const { subject, html } = incompleteBookingReminderEmail({
      customerFirstName: customer.first_name || 'racer',
      resumeUrl: `${base}/hold-card/${token}`,
      sessionDate: b.session_date,
      startTime: b.start_time,
    })
    await sendEmail({
      to: customer.email,
      subject,
      html,
      template: 'incomplete_booking_reminder',
      relatedBookingId: b.id,
      relatedCustomerId: customer.id,
    })

    // Mark reminded regardless of send outcome — exactly one nudge per booking.
    await supabase
      .from('bookings')
      .update({ incomplete_reminder_sent_at: new Date().toISOString() })
      .eq('id', b.id)
    sent++
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
