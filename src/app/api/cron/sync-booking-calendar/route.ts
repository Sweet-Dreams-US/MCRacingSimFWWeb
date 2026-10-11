// GET /api/cron/sync-booking-calendar
//
// Every 15 minutes: make sure every upcoming confirmed booking is on Mark's
// Google Calendar at the right time. Creates missing events, recreates ones
// deleted by hand, corrects wrong times. See src/lib/calendar-sync.ts.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncBookingCalendar } from '@/lib/calendar-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  // Same protection as the other cron routes: Vercel sends CRON_SECRET as a Bearer token.
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncBookingCalendar(createAdminClient())
    if (
      result.created.length || result.recreated.length || result.retimed.length ||
      result.adopted.length || result.duplicatesRemoved || result.failed.length
    ) {
      console.log('[calendar-sync]', JSON.stringify(result))
    }
    return NextResponse.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 500 : 200 })
  } catch (err) {
    console.error('[calendar-sync] failed:', err)
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'sync failed' }, { status: 500 })
  }
}
