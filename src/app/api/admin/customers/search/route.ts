// GET /api/admin/customers/search?q=...
// Typeahead search for the POS customer picker. Returns up to 10 matches
// by name or email.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
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
