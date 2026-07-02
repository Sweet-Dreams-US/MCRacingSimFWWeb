// /admin/parties — list of party invites with deposit status.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { partyTypeLabel } from '@/lib/parties-shared'

interface PartyRow {
  id: string
  contact_name: string
  contact_email: string
  party_type: string
  session_date: string
  start_time: string
  headcount: number
  total_price_cents: number
  deposit_cents: number
  deposit_status: string
  status: string
  public_token: string
  created_at: string
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t: string): string {
  const [h, m] = t.split(':')
  let hr = parseInt(h, 10)
  const p = hr >= 12 ? 'PM' : 'AM'
  if (hr === 0) hr = 12
  else if (hr > 12) hr -= 12
  return `${hr}:${m} ${p}`
}

function DepositBadge({ status }: { status: string }) {
  if (status === 'paid')
    return <span className="telemetry-text text-xs px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/30 uppercase">Deposit paid</span>
  if (status === 'refunded')
    return <span className="telemetry-text text-xs px-2 py-1 bg-white/5 text-pit-gray border border-white/10 uppercase">Refunded</span>
  return <span className="telemetry-text text-xs px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">Awaiting deposit</span>
}

export default async function PartiesPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('party_bookings')
    .select(
      'id, contact_name, contact_email, party_type, session_date, start_time, headcount, total_price_cents, deposit_cents, deposit_status, status, public_token, created_at'
    )
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as PartyRow[]

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">// Events</p>
          <h1 className="racing-headline text-3xl text-grid-white">Parties</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            {rows.length} part{rows.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <Link
          href="/admin/parties/new"
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-5 py-3 transition-colors"
        >
          + New Party Invite
        </Link>
      </div>

      {error ? (
        <div className="bg-apex-red/10 border border-apex-red/30 p-4">
          <p className="telemetry-text text-apex-red">Failed to load parties: {error.message}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-10 text-center">
          <p className="telemetry-text text-pit-gray">No parties yet. Create an invite to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-asphalt-dark border border-white/5 p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="telemetry-text text-xs px-2 py-0.5 bg-white/5 text-pit-gray border border-white/10 uppercase tracking-wider">
                      {partyTypeLabel(r.party_type)}
                    </span>
                    <span className="racing-headline text-lg text-grid-white">{r.contact_name}</span>
                    <span className="telemetry-text text-xs text-pit-gray">{r.id}</span>
                  </div>
                  <p className="telemetry-text text-sm text-pit-gray mt-1">
                    {fmtDate(r.session_date)} • {fmtTime(r.start_time)} • {r.headcount} guests • {r.contact_email}
                  </p>
                </div>
                <div className="text-right">
                  <DepositBadge status={r.deposit_status} />
                  <p className="telemetry-text text-sm text-grid-white mt-2">
                    {money(r.deposit_cents)} <span className="text-pit-gray">/ {money(r.total_price_cents)}</span>
                  </p>
                </div>
              </div>
              {r.deposit_status !== 'paid' && (
                <p className="telemetry-text text-xs text-pit-gray mt-2">
                  Pay link:{' '}
                  <span className="text-telemetry-cyan break-all">/party/{r.public_token}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
