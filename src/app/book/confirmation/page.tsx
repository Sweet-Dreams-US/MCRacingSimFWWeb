// /book/confirmation — post-booking thank-you page.
// After Stripe Elements confirms the SetupIntent, the browser lands here
// with ?bookingId=… in the URL. We fetch the booking from Supabase
// (instead of trusting URL params for everything) so the page always shows
// truthful data even if the user shares the URL.
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatDateLong } from '@/lib/pricing'

interface PageProps {
  searchParams: Promise<{ bookingId?: string; name?: string }>
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

export default async function ConfirmationPage({ searchParams }: PageProps) {
  const { bookingId, name } = await searchParams

  // If no bookingId, render a generic success state — covers cases where
  // someone bookmarked /book/confirmation or refreshed after navigating away
  if (!bookingId) {
    return <GenericSuccess />
  }

  // Fetch the booking. The service-role client is fine here — we're only
  // showing data the customer just submitted themselves, and the URL has
  // a single ID (not enumerable — booking IDs are random base36).
  const supabase = createAdminClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      `
      id, session_date, start_time, end_time, duration_hours, racer_count,
      session_price_cents, no_show_fee_cents, stripe_payment_method_id, status,
      customer:customers(first_name, email)
    `
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) {
    return <GenericSuccess />
  }

  const customer = Array.isArray(booking.customer)
    ? (booking.customer[0] ?? null)
    : booking.customer
  const greetingName = name || customer?.first_name || ''
  const cardOnFile = Boolean(booking.stripe_payment_method_id)

  return (
    <main className="min-h-screen bg-asphalt pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-telemetry-cyan/20 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-telemetry-cyan"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
            Booking <span className="text-telemetry-cyan">Confirmed!</span>
          </h1>
          <p className="telemetry-text text-pit-gray">
            Thanks{greetingName ? `, ${greetingName}` : ''}! Your session is locked in.
          </p>
        </div>

        {/* Booking Details Card */}
        <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                Booking ID
              </p>
              <p className="racing-headline text-2xl text-telemetry-cyan">{booking.id}</p>
            </div>
            <div className="px-3 py-1 bg-telemetry-cyan/20 text-telemetry-cyan telemetry-text text-sm uppercase">
              Confirmed
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <p className="telemetry-text text-xs text-pit-gray">Date</p>
              <p className="telemetry-text text-lg text-grid-white">
                {formatDateLong(booking.session_date)}
              </p>
            </div>
            <div>
              <p className="telemetry-text text-xs text-pit-gray">Time</p>
              <p className="telemetry-text text-lg text-grid-white">
                {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
              </p>
            </div>
            <div>
              <p className="telemetry-text text-xs text-pit-gray">Duration</p>
              <p className="telemetry-text text-lg text-grid-white">
                {booking.duration_hours} hour{booking.duration_hours > 1 ? 's' : ''}
              </p>
            </div>
            <div>
              <p className="telemetry-text text-xs text-pit-gray">Racers</p>
              <p className="telemetry-text text-lg text-grid-white">{booking.racer_count}</p>
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="flex justify-between items-center">
              <p className="telemetry-text text-pit-gray">Session price</p>
              <p className="racing-headline text-3xl text-apex-red">
                {formatDollars(booking.session_price_cents)}
              </p>
            </div>
            <p className="telemetry-text text-xs text-pit-gray">
              Paid in person at your session — cash or card.
            </p>
            {cardOnFile && (
              <div className="mt-3 p-3 bg-telemetry-cyan/5 border border-telemetry-cyan/20">
                <p className="telemetry-text text-xs text-telemetry-cyan font-bold uppercase tracking-wider mb-1">
                  Card On File
                </p>
                <p className="telemetry-text text-xs text-pit-gray">
                  Only charged if you no-show:{' '}
                  <span className="text-grid-white">
                    {formatDollars(booking.no_show_fee_cents)}
                  </span>{' '}
                  ($20 per seat).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Location Card */}
        <div className="bg-asphalt-dark border border-white/10 p-6 mb-6">
          <h3 className="racing-headline text-xl text-grid-white mb-4">
            <span className="text-apex-red">Location</span>
          </h3>
          <p className="telemetry-text text-grid-white text-lg">MC Racing Sim</p>
          <p className="telemetry-text text-pit-gray">1205 W Main St</p>
          <p className="telemetry-text text-pit-gray">Fort Wayne, IN 46808</p>
          <a
            href="https://maps.google.com/?q=1205+W+Main+St,+Fort+Wayne,+IN+46808"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-telemetry-cyan telemetry-text hover:underline"
          >
            Open in Google Maps →
          </a>
        </div>

        {/* Important Notes */}
        <div className="bg-apex-red/10 border border-apex-red/30 p-6 mb-8">
          <h3 className="racing-headline text-lg text-apex-red mb-3">Important</h3>
          <ul className="space-y-2 telemetry-text text-sm text-pit-gray">
            <li className="flex items-start gap-2">
              <span className="text-apex-red">•</span>
              Please arrive 10 minutes early for check-in
            </li>
            <li className="flex items-start gap-2">
              <span className="text-apex-red">•</span>
              All racers sign a waiver at the front desk on arrival
            </li>
            {cardOnFile && (
              <li className="flex items-start gap-2">
                <span className="text-apex-red">•</span>
                If you can&apos;t make it, cancel at least 24 hours in advance to
                avoid the {formatDollars(booking.no_show_fee_cents)} no-show fee
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="text-apex-red">•</span>
              Questions? Call us at{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">
                (808) 220-2600
              </a>
            </li>
          </ul>
        </div>

        {/* Confirmation sent notice */}
        <div className="text-center mb-8 p-4 bg-white/5 border border-white/10">
          <p className="telemetry-text text-sm text-pit-gray">
            A confirmation has been sent to{' '}
            <span className="text-grid-white">{customer?.email ?? 'your email'}</span>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-8 py-3 border border-white/20 text-grid-white telemetry-text text-center hover:border-white/40 transition-colors"
          >
            Back to Home
          </Link>
          <Link
            href="/book"
            className="px-8 py-3 bg-apex-red text-white racing-headline text-center hover:bg-apex-red/90 transition-colors"
          >
            Book Another Session
          </Link>
        </div>
      </div>
    </main>
  )
}

function GenericSuccess() {
  return (
    <main className="min-h-screen bg-asphalt pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-telemetry-cyan/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-telemetry-cyan"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h1 className="racing-headline text-3xl text-grid-white mb-4">
          Booking <span className="text-telemetry-cyan">Confirmed</span>
        </h1>
        <p className="telemetry-text text-pit-gray mb-8">
          Check your email for the confirmation. See you at the track!
        </p>
        <Link href="/" className="btn-primary inline-block">
          Back to Home
        </Link>
      </div>
    </main>
  )
}
