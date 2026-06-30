// GET /api/cron/send-booking-reminders
// Daily Vercel Cron. Emails a day-before reminder for every confirmed booking
// happening TOMORROW (Eastern) that hasn't been reminded yet.
//
// This is the Supabase-native replacement for the legacy SMS reminder cron
// (which read the old Google Sheet and is blocked on Twilio A2P). Idempotent
// via bookings.reminder_email_sent_at.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { bookingReminderEmail } from '@/lib/emails/templates'

export const runtime = 'nodejs'
export const maxDuration = 300

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

function getTomorrowEastern(): string {
  // Parse Eastern-today at noon (DST-safe) and add a day.
  const d = new Date(getTodayEastern() + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Fail CLOSED — if the
  // secret is unset/misconfigured, reject rather than exposing an endpoint that
  // reads customer PII and sends email.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const tomorrow = getTomorrowEastern()

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(
      `id, session_date, start_time, duration_hours, racer_count,
       reminder_email_sent_at,
       customer:customers(first_name, email)`
    )
    .eq('session_date', tomorrow)
    .eq('status', 'confirmed')
    .is('reminder_email_sent_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0
  const nowIso = new Date().toISOString()

  for (const b of bookings ?? []) {
    const customer = Array.isArray(b.customer) ? b.customer[0] : b.customer
    if (!customer?.email) {
      skipped++
      continue
    }

    // Atomically CLAIM the reminder before sending: stamp reminder_email_sent_at
    // only if it's still null. If another (overlapping/retried) run already
    // claimed it, claimed is empty and we skip — no double-send.
    const { data: claimed } = await supabase
      .from('bookings')
      .update({ reminder_email_sent_at: nowIso })
      .eq('id', b.id)
      .is('reminder_email_sent_at', null)
      .select('id')

    if (!claimed || claimed.length === 0) {
      skipped++
      continue
    }

    const reminder = bookingReminderEmail({
      customerFirstName: customer.first_name || 'racer',
      bookingId: b.id,
      sessionDate: b.session_date,
      startTime: b.start_time,
      durationHours: b.duration_hours,
      racerCount: b.racer_count,
    })

    const messageId = await sendEmail({
      to: customer.email,
      subject: reminder.subject,
      html: reminder.html,
      template: 'booking_reminder',
      relatedBookingId: b.id,
    })

    if (messageId !== null) {
      sent++
    } else {
      // Send failed — release the claim so a later run today can retry it.
      await supabase
        .from('bookings')
        .update({ reminder_email_sent_at: null })
        .eq('id', b.id)
      skipped++
    }
  }

  return NextResponse.json({ success: true, date: tomorrow, sent, skipped })
}
