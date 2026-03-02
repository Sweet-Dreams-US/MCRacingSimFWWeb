import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SMS Opt-In & Consent Disclosure | MC Racing Fort Wayne',
  description: 'SMS opt-in and consent disclosure for MC Racing Fort Wayne booking notifications. Learn how we collect consent and what messages we send.',
}

export default function SmsOptInPage() {
  return (
    <main className="min-h-screen bg-carbon-black py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="racing-headline text-4xl text-grid-white mb-8">
          SMS Opt-In &amp; <span className="text-telemetry-cyan">Consent Disclosure</span>
        </h1>

        <div className="bg-asphalt-dark border border-white/10 p-8 space-y-6 telemetry-text text-pit-gray">
          <div>
            <p className="text-grid-white font-bold">MC Racing Fort Wayne</p>
            <p className="text-sm text-pit-gray">Last Updated: March 2, 2026</p>
          </div>

          {/* Section 1: How Customers Opt In */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">How Customers Opt In</h2>
            <p>
              Customers opt in to receive SMS messages from MC Racing Fort Wayne through our
              online booking form only. There is no keyword, verbal, or paper opt-in method.
            </p>
            <p className="text-grid-white font-bold">Step-by-step process:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <span className="text-grid-white">Step 1 — Setup:</span> Customer visits{' '}
                <a href="https://mcracingfortwayne.com/book" className="text-telemetry-cyan underline hover:text-white">
                  mcracingfortwayne.com/book
                </a>{' '}
                to book a racing session.
              </li>
              <li>
                <span className="text-grid-white">Step 2 — Date &amp; Time:</span> Customer selects
                their desired date and available time slot.
              </li>
              <li>
                <span className="text-grid-white">Step 3 — Details:</span> Customer enters their name,
                phone number, email address, and birthday. Below the form fields, the customer must
                check a <span className="text-grid-white">required SMS consent checkbox</span> (unchecked
                by default) before proceeding.
              </li>
              <li>
                <span className="text-grid-white">Step 4 — Confirm:</span> Customer reviews all booking
                details and confirms the booking.
              </li>
            </ol>
            <p>
              The booking <span className="text-grid-white">cannot be submitted</span> without checking
              the SMS consent checkbox. The checkbox is <span className="text-grid-white">unchecked by
              default</span> — customers must actively opt in.
            </p>
          </section>

          {/* Section 2: Exact Opt-In Language */}
          <section className="space-y-3 bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-4 -mx-4 sm:mx-0">
            <h2 className="text-xl text-grid-white font-bold">Exact Opt-In Checkbox Language</h2>
            <p className="text-sm text-pit-gray">
              The following is the exact text displayed next to the SMS consent checkbox on Step 3
              of the booking form:
            </p>
            <div className="bg-carbon-black border border-telemetry-cyan/30 p-4 mt-2">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 border-2 border-telemetry-cyan/50 rounded-sm mt-0.5 flex-shrink-0" />
                <p className="text-sm text-grid-white">
                  I agree to receive booking confirmations, reminders, and session updates via SMS from
                  MC Racing Fort Wayne. Message frequency varies. Msg &amp; data rates may apply. Reply
                  STOP to unsubscribe, HELP for help. View our{' '}
                  <Link href="/privacy" className="text-telemetry-cyan underline hover:text-white">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link href="/terms" className="text-telemetry-cyan underline hover:text-white">
                    Terms of Service
                  </Link>
                  . <span className="text-apex-red">*</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-pit-gray mt-2">
              The <span className="text-apex-red">*</span> indicates this is a required field. The
              booking cannot proceed without checking this box.
            </p>
          </section>

          {/* Section 3: What Messages We Send */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">What Messages We Send</h2>
            <p>After opting in and completing a booking, customers may receive the following messages:</p>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border border-white/10">
                <thead>
                  <tr className="bg-white/5">
                    <th className="text-left p-3 text-grid-white font-bold border-b border-white/10">Message Type</th>
                    <th className="text-left p-3 text-grid-white font-bold border-b border-white/10">Description</th>
                    <th className="text-left p-3 text-grid-white font-bold border-b border-white/10">Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="p-3 text-grid-white align-top">Booking Confirmation</td>
                    <td className="p-3 align-top">Sent immediately after booking</td>
                    <td className="p-3 text-pit-gray text-xs align-top">
                      &quot;MC Racing Sim: Your booking is confirmed for Saturday, March 15 at 7:00 PM —
                      2 hour session, 3 racers. See you at MC Racing Fort Wayne! Reply STOP to opt out.&quot;
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="p-3 text-grid-white align-top">Session Reminder</td>
                    <td className="p-3 align-top">Sent the day before your session</td>
                    <td className="p-3 text-pit-gray text-xs align-top">
                      &quot;MC Racing Sim: Reminder — your sim racing session is tomorrow at 7:00 PM.
                      Please arrive 10 minutes early. Questions? Call us at (808) 220-2600. Reply STOP to opt out.&quot;
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="p-3 text-grid-white align-top">Pre-Race Setup</td>
                    <td className="p-3 align-top">Waiver link and preparation details</td>
                    <td className="p-3 text-pit-gray text-xs align-top">
                      &quot;MC Racing Sim: Thanks for booking! Complete your pre-race waiver and setup
                      here: https://mcracingfortwayne.com/setup?id=abc123 — Reply STOP to opt out.&quot;
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-grid-white align-top">Schedule Change</td>
                    <td className="p-3 align-top">If your session is rescheduled</td>
                    <td className="p-3 text-pit-gray text-xs align-top">
                      &quot;MC Racing Sim: Your session has been rescheduled to Sunday, March 16 at
                      3:00 PM. If this doesn&apos;t work, call us at (808) 220-2600. Reply STOP to opt out.&quot;
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 4: Message Frequency */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Message Frequency</h2>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><span className="text-grid-white">1–5 messages per booking</span></li>
              <li>Message and data rates may apply</li>
              <li>Transactional messages only — no marketing or promotional content</li>
            </ul>
          </section>

          {/* Section 5: How to Opt Out */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">How to Opt Out</h2>
            <p>
              Reply <span className="text-telemetry-cyan font-bold">STOP</span> to any message to
              unsubscribe. You will receive one confirmation message, then no further messages.
            </p>
            <p>
              You may also contact us at{' '}
              <a href="mailto:mcsimracing@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracing@gmail.com</a>{' '}
              or{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>{' '}
              to opt out.
            </p>
          </section>

          {/* Section 6: How to Get Help */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">How to Get Help</h2>
            <p>
              Reply <span className="text-telemetry-cyan font-bold">HELP</span> to any message, or
              contact us:
            </p>
            <div className="ml-4 space-y-1">
              <p>Email: <a href="mailto:mcsimracing@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracing@gmail.com</a></p>
              <p>Phone: <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a></p>
            </div>
          </section>

          {/* Section 7: Privacy */}
          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Privacy</h2>
            <p className="text-grid-white font-bold">
              Your mobile number and information will not be shared with third parties for marketing
              or promotional purposes.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>
                View our full Privacy Policy:{' '}
                <Link href="/privacy" className="text-telemetry-cyan underline hover:text-white">
                  mcracingfortwayne.com/privacy
                </Link>
              </li>
              <li>
                View our Terms of Service:{' '}
                <Link href="/terms" className="text-telemetry-cyan underline hover:text-white">
                  mcracingfortwayne.com/terms
                </Link>
              </li>
            </ul>
          </section>

          {/* Section 8: Consent Not Required */}
          <section className="space-y-3 bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-4 -mx-4 sm:mx-0">
            <h2 className="text-xl text-grid-white font-bold">Consent Is Not Required for Purchase</h2>
            <p>
              SMS consent is not a condition of booking. You may book a session by calling us at{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>.
            </p>
          </section>

          {/* Contact */}
          <section className="space-y-3 border-t border-white/10 pt-6">
            <h2 className="text-xl text-grid-white font-bold">Contact Us</h2>
            <div className="ml-4 space-y-1">
              <p className="text-grid-white font-bold">MC Racing Fort Wayne</p>
              <p>1205 W Main St</p>
              <p>Fort Wayne, Indiana 46802</p>
              <p><span className="text-grid-white">Email:</span>{' '}
                <a href="mailto:mcsimracing@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracing@gmail.com</a>
              </p>
              <p><span className="text-grid-white">Phone:</span>{' '}
                <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="telemetry-text text-telemetry-cyan hover:text-white transition-colors"
          >
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </main>
  )
}
