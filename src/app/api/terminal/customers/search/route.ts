// GET /api/terminal/customers/search?q=...
// Customer typeahead for the reader app's walk-in flow. Device-key auth.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ customers: [] })
  }

  const supabase = createAdminClient()
  const pattern = `%${q}%`
  const { data } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone')
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`)
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .limit(10)

  return NextResponse.json({
    customers: (data ?? []).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      email: c.email,
      phone: c.phone,
    })),
  })
}
