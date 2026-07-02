import { Metadata } from 'next'
import ContactClient from './ContactClient'

export const metadata: Metadata = {
  title: 'Contact & Group Bookings | MC Racing Sim Fort Wayne',
  description:
    'Planning a birthday party, corporate event, or group outing at MC Racing Sim Fort Wayne? Send us a message or call (808) 220-2600 and we’ll build the perfect package for you.',
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-carbon-black pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
            // Get In Touch
          </span>
          <h1 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
            Let&apos;s Plan Your <span className="text-apex-red">Event</span>
          </h1>
          <p className="telemetry-text text-pit-gray max-w-xl mx-auto">
            Birthday parties, corporate team-building, and big group nights are our specialty. Tell us what
            you&apos;re thinking and we&apos;ll put together a package — or call us and we&apos;ll book it on the spot.
          </p>
        </div>

        <ContactClient />
      </div>
    </main>
  )
}
