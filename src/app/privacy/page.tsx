'use client'

import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-carbon-black py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="racing-headline text-4xl text-grid-white mb-8">
          Privacy <span className="text-telemetry-cyan">Policy</span>
        </h1>

        <div className="bg-asphalt-dark border border-white/10 p-8 space-y-6 telemetry-text text-pit-gray">
          <div>
            <p className="text-grid-white font-bold">MC Racing Fort Wayne</p>
            <p className="text-sm text-pit-gray">Last Updated: March 2, 2026</p>
          </div>

          <p>
            MC Racing Fort Wayne (&quot;MC Racing,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website
            mcracingfortwayne.com and provides sim racing entertainment services at 1205 W Main St,
            Fort Wayne, Indiana. This Privacy Policy explains how we collect, use, disclose, and
            protect your information when you visit our website or use our services.
          </p>
          <p>
            By using our website or booking a session, you agree to the terms of this Privacy Policy.
          </p>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Information We Collect</h2>
            <p>We collect information you provide directly to us, including:</p>
            <p>
              <span className="text-grid-white">Personal Information:</span> Name, email address, and phone number
              provided when you book a racing session or contact us.
            </p>
            <p>
              <span className="text-grid-white">Payment Information:</span> Payment is collected in person at our
              facility. We do not collect or store credit card or payment information through our website. Any payment
              processing is handled by third-party payment processors; we do not store your payment details.
            </p>
            <p>
              <span className="text-grid-white">Booking Information:</span> Session date and time, number of racers,
              session duration, and any special requests.
            </p>
            <p>
              <span className="text-grid-white">Waiver and Safety Information:</span> Information provided on pre-race
              waivers and liability forms required before participating in racing sessions.
            </p>
            <p>
              <span className="text-grid-white">Communications:</span> Records of your communications with us,
              including emails, phone calls, and text messages.
            </p>
            <p>
              <span className="text-grid-white">Usage Data:</span> We automatically collect certain information when
              you visit our website, including IP address, browser type, device information, pages visited, and
              referring URLs. We use cookies and similar technologies to improve your experience and analyze
              website usage.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Process and manage your racing session bookings and payments</li>
              <li>Send transactional SMS messages including booking confirmations, session reminders, and pre-race setup instructions with waiver links</li>
              <li>Communicate with you about your sessions, including schedule changes</li>
              <li>Respond to your questions and requests</li>
              <li>Improve our website and services</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="space-y-3 bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-4 -mx-4 sm:mx-0">
            <h2 className="text-xl text-grid-white font-bold">SMS/Text Messaging Program</h2>
            <p>
              <span className="text-grid-white">Program Name:</span> MC Racing Fort Wayne Booking Notifications
            </p>
            <p>
              When you book a racing session through our website and check the required SMS consent
              checkbox, we will send you text messages related to your booking. These messages include:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Booking confirmations</li>
              <li>Session reminders (sent the day before your session)</li>
              <li>Pre-race setup instructions with waiver links</li>
              <li>Schedule change notifications</li>
            </ul>
            <p>
              <span className="text-grid-white">Message Frequency:</span> You will typically receive
              1–5 messages per booking. Messages are transactional only — no marketing or promotional
              messages are sent through this program.
            </p>
            <p>
              <span className="text-grid-white">Message and data rates may apply</span> depending on your
              mobile carrier and plan.
            </p>
            <p className="text-grid-white font-bold">
              No mobile information will be shared with third parties/affiliates for marketing/promotional purposes.
            </p>
            <p>
              You can <span className="text-grid-white">opt out</span> of SMS messages at any time by replying{' '}
              <span className="text-telemetry-cyan font-bold">STOP</span> to any message. After opting out, you will
              receive one final confirmation message and no further SMS messages will be sent. You can opt back in
              at any time by replying <span className="text-telemetry-cyan font-bold">START</span> or by checking
              the SMS consent box on a future booking.
            </p>
            <p>
              For <span className="text-grid-white">help</span> with SMS messaging, reply{' '}
              <span className="text-telemetry-cyan font-bold">HELP</span> to any message or contact us at{' '}
              <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracingfw@gmail.com</a> or{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>.
            </p>
            <p>
              <span className="text-grid-white">Carriers:</span> Supported on all major US carriers. Carriers
              are not liable for delayed or undelivered messages.
            </p>
            <p>
              <span className="text-grid-white">Consent is not a condition of purchase.</span> You may book a
              session by calling us directly at{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan underline hover:text-white">(808) 220-2600</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">How We Share Your Information</h2>
            <p>
              We do not sell, rent, or trade your personal information to third parties for
              their marketing purposes.
            </p>
            <p className="text-grid-white font-bold">
              We do not share mobile information with third parties for marketing or promotional purposes.
            </p>
            <p>We may share your information with:</p>
            <p>
              <span className="text-grid-white">Service Providers:</span> Trusted third-party companies that help us
              operate our business, including payment processors, website hosting providers, and our SMS service
              provider (Twilio). These providers are contractually obligated to protect your information and may
              only use it to perform services on our behalf.
            </p>
            <p>
              <span className="text-grid-white">Legal Requirements:</span> We may disclose your information if
              required to do so by law, court order, or government regulation, or if we believe disclosure is
              necessary to protect our rights, your safety, or the safety of others.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Data Security</h2>
            <p>
              We implement reasonable administrative, technical, and physical security
              measures to protect your personal information against unauthorized access,
              alteration, disclosure, or destruction. However, no method of transmission
              over the internet or electronic storage is completely secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Your Rights and Choices</h2>
            <p>You may:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Request access to the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information, subject to legal retention requirements</li>
              <li>Opt out of SMS messages at any time by replying STOP</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan underline hover:text-white">mcsimracingfw@gmail.com</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Children&apos;s Privacy</h2>
            <p>
              We do not knowingly collect personal information from children under 13.
              Minors under 18 may participate in racing sessions with parental or guardian
              consent as outlined in our waiver requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              any material changes by posting the updated policy on this page with a
              revised &quot;Last Updated&quot; date. Your continued use of our website or services
              after changes are posted constitutes your acceptance of the updated policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl text-grid-white font-bold">Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our privacy practices,
              please contact us at:
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
