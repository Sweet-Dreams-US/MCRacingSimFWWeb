import type { Metadata } from 'next'
import BookingLookupForm from './BookingLookupForm'

export const metadata: Metadata = {
  title: 'Find My Booking',
  description:
    'Look up your MC Racing Sim Fort Wayne booking by booking number and email to view your session details.',
  alternates: { canonical: 'https://www.mcracingfortwayne.com/booking-lookup' },
}

export default function BookingLookupPage() {
  return (
    <main className="min-h-screen bg-asphalt pt-28 pb-16 px-6">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-3">
            // Booking Lookup
          </span>
          <h1 className="racing-headline text-4xl md:text-5xl text-grid-white mb-3">
            Find Your <span className="text-apex-red">Booking</span>
          </h1>
          <p className="telemetry-text text-sm text-pit-gray">
            Enter your booking number and the email you booked with to see your
            session details.
          </p>
        </div>

        <BookingLookupForm />
      </div>
    </main>
  )
}
