// /admin/discounts — generate + manage discount codes.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DiscountManager, { type DiscountRow } from './DiscountManager'

export default async function DiscountsPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('discount_codes')
    .select(
      'id, code, kind, percent_off, amount_off_cents, applies_to, active, expires_at, max_redemptions, redemption_count, max_total_hours, hours_redeemed, source, notes, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="racing-headline text-3xl text-grid-white">Discount Codes</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Generate codes customers enter at online checkout, or apply on invites.
        </p>
      </div>
      <DiscountManager initialCodes={(data ?? []) as DiscountRow[]} />
    </div>
  )
}
