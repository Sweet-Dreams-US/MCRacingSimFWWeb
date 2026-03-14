'use client'

import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-carbon-black py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="racing-headline text-4xl text-grid-white mb-8">
          Terms of <span className="text-telemetry-cyan">Service</span>
        </h1>

        <div className="bg-asphalt-dark border border-white/10 p-8 space-y-6 telemetry-text text-pit-gray">
          <div>
            <p className="text-grid-white font-bold">MC Racing Fort Wayne</p>
            <p className="text-sm text-pit-gray">Last Updated: March 2, 2026</p>
          </div>

          <p>
            Welcome to MC Racing Fort Wayne. By accessing our website at
            mcracingfortwayne.com or booking a racing session, you agree to be bound
            by these Terms of Service (&quot;Terms&quot;). Please read them carefully.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">About Our Services</h2>
            <p>
              MC Racing Fort Wayne is a sim racing entertainment venue located at
              1205 W Main St, Fort Wayne, Indiana. We offer individual racing sessions,
              group bookings, birthday packages, and special events. Customers can book
              sessions online at{' '}
              <a href="https://mcracingfortwayne.com/book" className="text-telemetry-cyan underline hover:text-white">
                mcracingfortwayne.com/book
              </a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Booking and Cancellation Policy</h2>
            <p>
              All bookings are subject to availability. Bookings are made online at{' '}
              <a href="https://mcracingfortwayne.com/book" className="text-telemetry-cyan underline hover:text-white">
                mcracingfortwayne.com/book
              </a>. When you book a session through our website, you agree to provide accurate
              and complete information. Pricing is displayed at the time of booking and is subject
              to change without notice for future bookings.
            </p>
            <p>
              Payment is collected in person after your session. We accept cash, credit cards,
              and debit cards.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Cancellations must be made at least 24 hours before your session for a full refund</li>
              <li>Cancellations made less than 24 hours in advance: Subject to a cancellation fee</li>
              <li>No-shows may be charged the full session price</li>
              <li>To cancel or reschedule, call us at{' '}
                <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Waiver and Liability</h2>
            <p>
              All participants are required to sign a liability waiver before
              participating in any racing session. Participants under 18 must have a
              parent or legal guardian sign on their behalf. Pre-race waivers and setup
              forms may be completed online in advance via a link sent to your phone
              number or email.
            </p>
          </section>

          <section className="space-y-3 bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-4 -mx-4 sm:mx-0">
            <h2 className="text-xl text-grid-white font-bold">SMS Notifications Program</h2>

            <p>
              By checking the SMS consent checkbox during booking, you agree to receive text
              messages from MC Racing Fort Wayne. The SMS consent checkbox is unchecked by default
              and must be actively selected by the customer.
            </p>

            <div className="space-y-2">
              <p>
                <span className="text-grid-white">Message Types:</span> Booking confirmations,
                session reminders (sent the day before your session), pre-race setup instructions
                with waiver links, and schedule change notifications.
              </p>
              <p>
                These are <span className="text-grid-white">transactional messages only</span> — no
                marketing or promotional content is sent through this program.
              </p>
              <p>
                <span className="text-grid-white">Message Frequency:</span> You will typically receive
                1–5 messages per booking.
              </p>
              <p>
                <span className="text-grid-white">Message and Data Rates:</span> Message and data rates
                may apply. Check with your mobile carrier for details about your text messaging plan.
              </p>
            </div>

            <div className="border-t border-telemetry-cyan/20 pt-3 mt-3 space-y-2">
              <p>
                <span className="text-grid-white">How to Opt Out:</span> Reply{' '}
                <span className="text-telemetry-cyan font-bold">STOP</span> to any message from
                MC Racing Fort Wayne to cancel and stop receiving SMS messages. You will receive a
                one-time confirmation that you have been unsubscribed. No additional messages will
                be sent unless you opt back in.
              </p>
            </div>

            <div className="border-t border-telemetry-cyan/20 pt-3 mt-3 space-y-2">
              <p>
                <span className="text-grid-white">How to Get Help:</span> Reply{' '}
                <span className="text-telemetry-cyan font-bold">HELP</span> to any message from
                MC Racing Fort Wayne, or contact us at:
              </p>
              <div className="ml-4">
                <p>Email: <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracingfw@gmail.com</a></p>
                <p>Phone: <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a></p>
              </div>
            </div>

            <div className="border-t border-telemetry-cyan/20 pt-3 mt-3 space-y-2">
              <p>
                <span className="text-grid-white">Consent Is Not Required for Purchase:</span> SMS
                consent is not a condition of booking. You may book a session by calling us directly
                at{' '}
                <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>.
              </p>
            </div>

            <div className="border-t border-telemetry-cyan/20 pt-3 mt-3 space-y-2">
              <p>
                <span className="text-grid-white">Supported Carriers:</span> SMS messaging is supported
                on all major US carriers including AT&amp;T, Verizon, T-Mobile, and others. Carriers are
                not liable for delayed or undelivered messages.
              </p>
              <p className="text-grid-white font-bold">
                Your mobile number and information will not be shared with third parties for marketing
                or promotional purposes.
              </p>
              <p>
                See our{' '}
                <Link href="/privacy" className="text-telemetry-cyan underline hover:text-white">Privacy Policy</Link>{' '}
                for full details on how we handle your information.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Payment Terms</h2>
            <p>
              Payment is collected in person at our facility after your session. We accept cash,
              credit cards, and debit cards. Pricing is per session (not per person) and varies
              based on the number of racers, session duration, and day of the week.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Arrival and Check-in</h2>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Please arrive 10 minutes before your scheduled session</li>
              <li>All participants must complete a liability waiver before racing</li>
              <li>Late arrivals may result in reduced session time</li>
              <li>We reserve the right to refuse service to anyone who appears intoxicated</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Equipment and Code of Conduct</h2>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Treat all equipment with care and respect</li>
              <li>Report any equipment issues to staff immediately</li>
              <li>No food or drinks near the simulators</li>
              <li>Damage caused by misuse may result in repair charges</li>
              <li>We reserve the right to end a session for inappropriate behavior</li>
              <li>Respect staff, other guests, and the facility at all times</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Age Requirements</h2>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Minimum age to use simulators: 10 years old</li>
              <li>Participants under 18 must have a parent/guardian present or sign the waiver</li>
              <li>Staff may request ID to verify age</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Hours of Operation</h2>
            <p>
              <span className="text-grid-white">Monday:</span> Reservations Only<br />
              <span className="text-grid-white">Tuesday – Thursday:</span> Noon – Midnight<br />
              <span className="text-grid-white">Friday – Saturday:</span> Noon – 2:00 AM<br />
              <span className="text-grid-white">Sunday:</span> Noon – Midnight<br />
              Always open anytime for reservations.
            </p>
            <p>
              Hours may vary on holidays. Check our website or call for current hours.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Website Use</h2>
            <p>
              You agree to use our website only for lawful purposes and in accordance
              with these Terms. You agree not to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Use the website in any way that violates applicable laws or regulations</li>
              <li>Attempt to gain unauthorized access to any part of the website</li>
              <li>Use the website to transmit harmful code or interfere with its operation</li>
              <li>Reproduce, distribute, or modify any content on the website without our written consent</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Intellectual Property</h2>
            <p>
              All content on our website, including text, graphics, logos, images, and
              software, is the property of MC Racing Fort Wayne or its licensors and
              is protected by applicable intellectual property laws. You may not use,
              reproduce, or distribute any content without our prior written permission.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, MC Racing Fort Wayne shall not be
              liable for any indirect, incidental, special, consequential, or punitive
              damages arising from your use of our website or services. Our total liability
              for any claim arising from these Terms or our services shall not exceed the
              amount you paid for the specific session giving rise to the claim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Disclaimer of Warranties</h2>
            <p>
              Our website and services are provided &quot;as is&quot; and &quot;as available&quot; without
              warranties of any kind, either express or implied, including but not limited
              to implied warranties of merchantability, fitness for a particular purpose,
              and non-infringement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless MC Racing Fort Wayne, its owners,
              employees, and agents from any claims, damages, losses, or expenses
              (including reasonable attorney&apos;s fees) arising from your use of our
              website or services, your violation of these Terms, or your violation
              of any rights of a third party.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of
              the State of Indiana, without regard to its conflict of law provisions.
              Any disputes arising under these Terms shall be resolved in the courts
              of Allen County, Indiana.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be
              effective immediately upon posting to this page with a revised &quot;Last
              Updated&quot; date. Your continued use of our website or services after changes
              are posted constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Contact Us</h2>
            <p>
              If you have questions about these Terms of Service, please contact us at:
            </p>
            <div className="ml-4 space-y-1">
              <p className="text-grid-white font-bold">MC Racing Fort Wayne</p>
              <p>1205 W Main St</p>
              <p>Fort Wayne, Indiana 46802</p>
              <p><span className="text-grid-white">Email:</span>{' '}
                <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracingfw@gmail.com</a>
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
