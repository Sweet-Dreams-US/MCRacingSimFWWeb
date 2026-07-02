// /hold-card/[token] — the require-card invite's "save your card" page. Reached
// only via the unguessable card_link_token from the invite email. The customer
// consents to the no-show policy and saves a card (no charge); the booking
// confirms once the card is on file (setup_intent webhook).
import { createAdminClient } from '@/lib/supabase/admin'
import HoldCardClient from './HoldCardClient'

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
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

export default async function HoldCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const { token } = await params
  const { redirect_status } = await searchParams
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('session_date, start_time, duration_hours, racer_count, session_price_cents, no_show_fee_cents, stripe_payment_method_id, status')
    .eq('card_link_token', token)
    .maybeSingle()

  if (!booking) {
    return (
      <Shell>
        <div className="bg-asphalt-dark border border-white/10 p-8 text-center">
          <h1 className="racing-headline text-2xl text-grid-white mb-3">Link not found</h1>
          <p className="telemetry-text text-pit-gray">
            This link isn&apos;t valid. Call us at{' '}
            <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">(808) 220-2600</a>.
          </p>
        </div>
      </Shell>
    )
  }

  const details = (
    <div className="bg-asphalt-dark border border-white/10 p-6 mb-6 space-y-2">
      {[
        ['Date', formatDate(booking.session_date)],
        ['Start time', formatTime(booking.start_time)],
        ['Duration', `${booking.duration_hours}h`],
        ['Racers', String(booking.racer_count)],
        ['Session price', formatDollars(booking.session_price_cents)],
      ].map(([label, value]) => (
        <div key={label} className="flex justify-between telemetry-text text-sm">
          <span className="text-pit-gray">{label}</span>
          <span className="text-grid-white">{value}</span>
        </div>
      ))}
    </div>
  )

  // Confirmed = a card is genuinely on file (webhook truth). Never trust the
  // redirect param alone.
  if (booking.stripe_payment_method_id) {
    return (
      <Shell>
        <div className="text-center mb-8">
          <h1 className="racing-headline text-3xl text-grid-white">
            You&apos;re <span className="text-telemetry-cyan">Confirmed</span>
          </h1>
        </div>
        {details}
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-5 text-center">
          <p className="telemetry-text text-grid-white mb-2">Card saved — your session is locked in. 🏁</p>
          <p className="telemetry-text text-sm text-pit-gray">
            Your card is only charged the {formatDollars(booking.no_show_fee_cents)} no-show fee if you don&apos;t show.
          </p>
        </div>
      </Shell>
    )
  }

  // Stale link: the invite was cancelled or already settled. Don't show a card
  // form for a booking that's no longer awaiting one.
  if (booking.status !== 'pending') {
    return (
      <Shell>
        <div className="bg-asphalt-dark border border-white/10 p-8 text-center">
          <h1 className="racing-headline text-2xl text-grid-white mb-3">No longer available</h1>
          <p className="telemetry-text text-pit-gray">
            This booking is no longer awaiting a card. If you think that&apos;s a mistake, call us at{' '}
            <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">(808) 220-2600</a>.
          </p>
        </div>
      </Shell>
    )
  }

  if (redirect_status === 'succeeded') {
    return (
      <Shell>
        <div className="text-center mb-8">
          <h1 className="racing-headline text-3xl text-grid-white">Card <span className="text-telemetry-cyan">Received</span></h1>
        </div>
        {details}
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-5 text-center">
          <p className="telemetry-text text-grid-white mb-2">Finalizing your booking…</p>
          <p className="telemetry-text text-sm text-pit-gray">
            Thanks! We&apos;re confirming your card —{' '}
            <a href={`/hold-card/${token}`} className="text-telemetry-cyan hover:underline">refresh</a> in a moment.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="text-center mb-8">
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">// Confirm Your Spot</p>
        <h1 className="racing-headline text-3xl text-grid-white">
          Save Your <span className="text-apex-red">Card</span>
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-2">
          Not charged today — only a no-show fee if you don&apos;t show up.
        </p>
      </div>
      {details}
      <HoldCardClient
        token={token}
        noShowFeeCents={booking.no_show_fee_cents}
      />
    </Shell>
  )
}
