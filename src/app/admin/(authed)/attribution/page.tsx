// /admin/attribution — unified revenue by marketing source (ALL channels) plus
// a form to log phone / walk-in bookings into the mc_bookings ledger. Reads the
// mc_revenue_by_source view. Online bookings flow into the ledger automatically.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import LogBookingForm from './LogBookingForm'

export const dynamic = 'force-dynamic'

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function AttributionPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data: rows } = await supabase
    .from('mc_revenue_by_source')
    .select('attributed_source, bookings, revenue, deposits_collected')

  // Roll the per-month view rows up to all-time totals per source.
  const bySource = new Map<string, { bookings: number; revenue: number }>()
  for (const r of rows ?? []) {
    const key = r.attributed_source ?? 'Unknown'
    const cur = bySource.get(key) ?? { bookings: 0, revenue: 0 }
    cur.bookings += Number(r.bookings ?? 0)
    cur.revenue += Number(r.revenue ?? 0)
    bySource.set(key, cur)
  }
  const sorted = Array.from(bySource.entries()).sort((a, b) => b[1].revenue - a[1].revenue)
  const totalRevenue = sorted.reduce((s, [, v]) => s + v.revenue, 0)
  const totalBookings = sorted.reduce((s, [, v]) => s + v.bookings, 0)

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="racing-headline text-3xl text-grid-white">Revenue by Source</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          All channels (online, phone, walk-in), grouped by how the customer heard about us.
          Online bookings are recorded automatically; log phone &amp; walk-ins below.
        </p>
      </div>

      <section>
        {sorted.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">
              No bookings recorded yet. Completed online bookings and any logged below will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/10">
            <div className="grid grid-cols-12 px-4 py-2 border-b border-white/10 telemetry-text text-[11px] text-pit-gray uppercase tracking-wider">
              <div className="col-span-6">Source</div>
              <div className="col-span-2 text-right">Bookings</div>
              <div className="col-span-4 text-right">Revenue</div>
            </div>
            {sorted.map(([source, v]) => {
              const pct = totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 100) : 0
              const isMeta = source === 'Facebook or Instagram'
              return (
                <div key={source} className="grid grid-cols-12 px-4 py-3 border-b border-white/5 items-center">
                  <div className="col-span-6 telemetry-text text-grid-white">
                    {source}
                    {isMeta && (
                      <span className="ml-2 telemetry-text text-[10px] px-1.5 py-0.5 bg-telemetry-cyan/15 text-telemetry-cyan uppercase tracking-wider">
                        Ads
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right telemetry-text text-pit-gray">{v.bookings}</div>
                  <div className="col-span-4 text-right">
                    <span className="racing-headline text-lg text-telemetry-cyan tabular-nums">{money(v.revenue)}</span>
                    <span className="telemetry-text text-xs text-pit-gray ml-2">{pct}%</span>
                  </div>
                </div>
              )
            })}
            <div className="grid grid-cols-12 px-4 py-3 items-center">
              <div className="col-span-6 telemetry-text text-grid-white font-bold">Total</div>
              <div className="col-span-2 text-right telemetry-text text-grid-white">{totalBookings}</div>
              <div className="col-span-4 text-right racing-headline text-lg text-grid-white tabular-nums">
                {money(totalRevenue)}
              </div>
            </div>
          </div>
        )}
        <p className="telemetry-text text-[11px] text-pit-gray mt-2">
          All-time totals. The <code className="text-pit-gray">mc_revenue_by_source</code> view breaks this
          down by month for any period.
        </p>
        <p className="telemetry-text text-[11px] text-pit-gray mt-1">
          Includes <span className="text-grid-white">online</span> bookings (auto, at the booked
          session price) plus any <span className="text-grid-white">phone / walk-in</span> bookings you log
          below. Reader (in-person POS) sales aren&apos;t auto-included yet — log those here to count them.
        </p>
      </section>

      <LogBookingForm />
    </div>
  )
}
