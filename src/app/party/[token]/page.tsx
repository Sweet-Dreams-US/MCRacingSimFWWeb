// /party/[token] — the invitee's deposit page. Reached only via the unguessable
// public_token from their invite email. Shows the event details and collects
// the 50% deposit; once paid (or on the Stripe redirect back), shows confirmed.
import { createAdminClient } from '@/lib/supabase/admin'
import { partyTypeLabel } from '@/lib/parties-shared'
import PartyDepositClient from './PartyDepositClient'

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}
function formatTime(t: string): string {
  const [h, m] = t.split(':')
  let hr = parseInt(h, 10)
  const period = hr >= 12 ? 'PM' : 'AM'
  if (hr === 0) hr = 12
  else if (hr > 12) hr -= 12
  return `${hr}:${m ?? '00'} ${period}`
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-carbon-black pt-24 pb-16 px-4">
      <div className="max-w-lg mx-auto">{children}</div>
    </main>
  )
}

export default async function PartyDepositPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const { token } = await params
  const { redirect_status } = await searchParams
  const supabase = createAdminClient()

  const { data: party } = await supabase
    .from('party_bookings')
    .select(
      'party_type, session_date, start_time, headcount, total_price_cents, deposit_cents, deposit_status, contact_name'
    )
    .eq('public_token', token)
    .maybeSingle()

  // Generic not-found (don't confirm/deny a token by leaking details).
  if (!party) {
    return (
      <Shell>
        <div className="bg-asphalt-dark border border-white/10 p-8 text-center">
          <h1 className="racing-headline text-2xl text-grid-white mb-3">Link not found</h1>
          <p className="telemetry-text text-pit-gray">
            This deposit link isn&apos;t valid. Double-check the link in your email, or call us at{' '}
            <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">(808) 220-2600</a>.
          </p>
        </div>
      </Shell>
    )
  }

  const details = (
    <div className="bg-asphalt-dark border border-white/10 p-6 mb-6">
      <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-3">
        // {partyTypeLabel(party.party_type)}
      </p>
      <div className="space-y-2">
        {[
          ['Date', formatDate(party.session_date)],
          ['Start time', formatTime(party.start_time)],
          ['Guests', String(party.headcount)],
          ['Total', formatDollars(party.total_price_cents)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between telemetry-text text-sm">
            <span className="text-pit-gray">{label}</span>
            <span className="text-grid-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // Definitively confirmed — the webhook flipped deposit_status to 'paid'.
  // (deposit_status is the ONLY source of truth; we never trust the redirect
  // query param alone, or anyone with the link could fake a confirmed screen.)
  if (party.deposit_status === 'paid') {
    return (
      <Shell>
        <div className="text-center mb-8">
          <h1 className="racing-headline text-3xl text-grid-white">
            You&apos;re <span className="text-telemetry-cyan">Confirmed</span>
          </h1>
        </div>
        {details}
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-5 text-center">
          <p className="telemetry-text text-grid-white mb-2">
            Deposit received — your event is locked in. 🏁
          </p>
          <p className="telemetry-text text-sm text-pit-gray">
            We&apos;ll be in touch to finalize the details. The remaining{' '}
            {formatDollars(party.total_price_cents - party.deposit_cents)} is collected at the venue.
          </p>
        </div>
      </Shell>
    )
  }

  // Returned from Stripe (e.g. after 3DS) but the webhook hasn't flipped the row
  // yet — show an honest "processing" state, not a confirmation. A quick refresh
  // (once the webhook lands) shows the confirmed screen above.
  if (redirect_status === 'succeeded') {
    return (
      <Shell>
        <div className="text-center mb-8">
          <h1 className="racing-headline text-3xl text-grid-white">
            Payment <span className="text-telemetry-cyan">Received</span>
          </h1>
        </div>
        {details}
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-5 text-center">
          <p className="telemetry-text text-grid-white mb-2">Finalizing your booking…</p>
          <p className="telemetry-text text-sm text-pit-gray">
            Thanks! We&apos;re confirming your deposit — this can take a few seconds.{' '}
            <a href={`/party/${token}`} className="text-telemetry-cyan hover:underline">Refresh</a> to see your confirmation.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center mb-8">
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">// Secure Deposit</p>
        <h1 className="racing-headline text-3xl text-grid-white">
          Confirm Your <span className="text-apex-red">Event</span>
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-2">
          Pay the 50% deposit to lock in your date. The rest is settled at the venue.
        </p>
      </div>
      {details}
      <PartyDepositClient token={token} depositCents={party.deposit_cents} />
    </Shell>
  )
}
