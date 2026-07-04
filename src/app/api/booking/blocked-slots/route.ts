// GET /api/booking/blocked-slots?date=YYYY-MM-DD
// Public endpoint the booking widget uses to grey out admin-blocked times.
// Returns only the time windows — never the internal reason.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { success: false, error: 'date must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('availability_blocks')
    .select('start_time, end_time')
    .eq('block_date', date)

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Could not load availability' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    blocks: (data ?? []).map((b) => ({
      startTime: b.start_time, // "HH:MM:SS" or null (null = whole day)
      endTime: b.end_time,
    })),
  })
}
