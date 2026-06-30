// POST /api/checkin/lookup
// Public endpoint for the check-in kiosk's "Been here before?" feature.
// A racer enters their email; if a matching customer exists we return a
// minimal set of fields to PREFILL the waiver form so they don't have to
// retype everything (they just confirm and re-sign).
//
// Email-only lookup by design: we never expose a name-based search that
// could enumerate the customer list. You must already know the email.
//
// Returns only safe prefill fields — never Stripe IDs, marketing flags,
// totals, or waiver history.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface LookupBody {
  email?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LookupBody
  const email = body.email?.trim().toLowerCase()

  if (!email) {
    return NextResponse.json(
      { found: false, error: 'Enter your email.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Case-insensitive match on email. There can in theory be more than one row
  // with the same email (walk-ins are never deduped on insert), so take the
  // most recently updated one for the freshest prefill data.
  const { data: customer, error } = await supabase
    .from('customers')
    .select('first_name, last_name, phone, birthday')
    .ilike('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !customer) {
    return NextResponse.json({ found: false })
  }

  return NextResponse.json({
    found: true,
    customer: {
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone ?? '',
      birthday: customer.birthday ?? '',
    },
  })
}
