import { Metadata } from 'next'
import BookingFlow from '@/components/booking/BookingFlow'

export const metadata: Metadata = {
  title: 'Book Your Session | MC Racing Sim',
  description: 'Book your sim racing session at MC Racing Sim in Fort Wayne. Choose your date, time, and number of racers.',
}

export default function BookPage() {
  return (
    <main className="min-h-screen bg-carbon-black pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
            Book Your <span className="text-apex-red">Session</span>
          </h1>
          <p className="telemetry-text text-pit-gray max-w-xl mx-auto">
            Reserve your spot on the grid. Choose your racers, duration, and preferred time slot.
          </p>

          {/* Book online below, or call to book. */}
          <div className="mt-6 inline-flex flex-col sm:flex-row items-center gap-3 bg-asphalt-dark border border-telemetry-cyan/20 px-5 py-3">
            <span className="telemetry-text text-sm text-pit-gray">
              Prefer to book by phone?
            </span>
            <a
              href="tel:+18082202600"
              className="telemetry-text text-sm text-telemetry-cyan hover:text-telemetry-cyan-glow font-bold tracking-wide"
            >
              Call (808) 220-2600
            </a>
          </div>
        </div>

        {/* Booking Flow */}
        <BookingFlow />
      </div>
    </main>
  )
}
