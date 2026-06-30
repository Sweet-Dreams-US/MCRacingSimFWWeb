// /admin/marketing/new — compose a new campaign.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { countEmailableAudience } from '@/lib/marketing/send'
import CampaignComposer from '../CampaignComposer'

export default async function NewCampaignPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const audienceCount = await countEmailableAudience(supabase)

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <Link
          href="/admin/marketing"
          className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
        >
          ← Back to Email Marketing
        </Link>
        <h1 className="racing-headline text-3xl text-grid-white mt-2">New Campaign</h1>
      </div>

      <CampaignComposer mode="create" audienceCount={audienceCount} />
    </div>
  )
}
