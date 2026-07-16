// GET /api/terminal/customers/recent_checkins
// Recent liability forms (waiver signatures) for the reader's new-sale screen:
// someone signs on the kiosk, walks to the counter, and staff taps their name
// instead of typing a search. Newest first. Device-key auth.
//
// Check-ins don't live in their own table — /api/checkin stamps the waiver onto
// the customer row (waiver_signed_at + waiver_form_data), so "recent liability
// forms" is just customers ordered by waiver_signed_at.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'
// The reader polls this — never serve a cached list.
export const dynamic = 'force-dynamic'

// Only surface forms signed recently; an older one is a returning customer to be
// searched for, not someone standing at the counter right now.
const WINDOW_HOURS = 18

export async function GET(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone, waiver_signed_at')
    .not('waiver_signed_at', 'is', null)
    .gte('waiver_signed_at', since)
    .order('waiver_signed_at', { ascending: false })
    .limit(25)

  if (error) {
    return NextResponse.json({ error: error.message, customers: [] }, { status: 500 })
  }

  return NextResponse.json({
    // Same shape as /customers/search so the reader can reuse its pick handler.
    customers: (data ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      email: c.email,
      phone: c.phone,
      signedAt: c.waiver_signed_at,
    })),
  })
}
