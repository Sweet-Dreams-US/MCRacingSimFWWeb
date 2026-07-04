// /admin/availability — block off hours (or whole days) from online booking.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import AvailabilityManager, { type BlockRow } from './AvailabilityManager'

export default async function AvailabilityPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  // Show today onward — past blocks are noise (they can't affect anything).
  // "Today" in venue time (Eastern), not server UTC, so a block stays visible
  // through the whole business day including the past-midnight tail.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date())

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('availability_blocks')
    .select('id, block_date, start_time, end_time, reason, created_at')
    .gte('block_date', today)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true })
    .limit(200)

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="racing-headline text-3xl text-grid-white">Availability</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Block off hours or whole days so customers can&apos;t book them online.
          Admin invites still work inside a block.
        </p>
      </div>
      <AvailabilityManager initialBlocks={(data ?? []) as BlockRow[]} />
    </div>
  )
}
