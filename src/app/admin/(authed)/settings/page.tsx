// /admin/settings — team management (owner-editable) + a read-only business
// reference. Any admin can view; only owners can change roles / access.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NO_SHOW_FEE_CENTS_PER_SEAT } from '@/lib/pricing'
import TeamManager, { type AdminRow } from './TeamManager'

export default async function SettingsPage() {
  let adminCtx
  try {
    adminCtx = await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const isOwner = adminCtx.admin.role === 'owner'
  const supabase = createAdminClient()

  const { data: admins } = await supabase
    .from('admin_users')
    .select('id, full_name, email, role, active, created_at')
    .order('active', { ascending: false })
    .order('full_name', { ascending: true })

  const rows = (admins ?? []) as AdminRow[]

  const businessInfo: Array<[string, string]> = [
    ['Address', '1205 W Main St, Fort Wayne, IN 46808'],
    ['Phone', '(808) 220-2600'],
    ['Hours', 'Tue–Sun, Noon–2am · Closed Mondays'],
    ['No-show fee', `$${(NO_SHOW_FEE_CENTS_PER_SEAT / 100).toFixed(0)} per seat`],
  ]

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-4xl mx-auto space-y-10">
      <div>
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">// Settings</p>
        <h1 className="racing-headline text-3xl text-grid-white">Settings</h1>
      </div>

      {/* Team */}
      <section className="space-y-4">
        <div>
          <h2 className="racing-headline text-xl text-grid-white">Team &amp; Access</h2>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {isOwner
              ? 'Manage who can sign in and what they can do.'
              : 'Everyone with access to this console. Only an owner can change roles.'}
          </p>
        </div>
        <TeamManager admins={rows} currentAdminId={adminCtx.admin.id} canEdit={isOwner} />
      </section>

      {/* Business reference */}
      <section className="space-y-4">
        <div>
          <h2 className="racing-headline text-xl text-grid-white">Business Info</h2>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            For reference. Pricing, hours, and fees are configured in code — ask your developer to change them.
          </p>
        </div>
        <div className="bg-asphalt-dark border border-white/5 overflow-x-auto">
          <table className="w-full">
            <tbody>
              {businessInfo.map(([label, value]) => (
                <tr key={label} className="border-b border-white/5 last:border-b-0">
                  <td className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider w-1/3">{label}</td>
                  <td className="p-4 telemetry-text text-grid-white">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
