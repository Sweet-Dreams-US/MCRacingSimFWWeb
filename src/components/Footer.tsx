'use client'

import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-asphalt-dark border-t border-white/5">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-apex-red flex items-center justify-center transform -skew-x-6">
                <span className="text-white font-bold text-xl transform skew-x-6">
                  MC
                </span>
              </div>
              <div>
                <span className="racing-headline text-xl text-grid-white">
                  Racing Sim
                </span>
                <span className="block text-xs text-pit-gray telemetry-text tracking-widest">
                  FORT WAYNE
                </span>
              </div>
            </div>
            <p className="telemetry-text text-sm text-pit-gray leading-relaxed">
              Fort Wayne's only professional-grade sim racing facility.
              Real physics. No consequences.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="racing-headline text-lg text-grid-white mb-6">
              Navigate
            </h4>
            <ul className="space-y-3">
              {[
                { href: '/', label: 'Start Line' },
                { href: '/pricing', label: 'The Garage' },
                { href: '/pit-lane', label: 'Parties' },
                { href: '/location', label: 'The Paddock' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="telemetry-text text-sm text-pit-gray hover:text-apex-red transition-colors flex items-center gap-2"
                  >
                    <span className="w-2 h-0.5 bg-apex-red"></span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="racing-headline text-lg text-grid-white mb-6">
              The Paddock
            </h4>
            <address className="not-italic space-y-4">
              <div className="telemetry-text text-sm text-pit-gray">
                <span className="text-telemetry-cyan">LOC://</span>
                <br />
                1205 W Main St
                <br />
                Fort Wayne, IN 46808
              </div>
              <div className="telemetry-text text-sm text-pit-gray">
                <span className="text-telemetry-cyan">TEL://</span>
                <br />
                <a href="tel:+18082202600" className="hover:text-apex-red transition-colors">
                  1(808) 220-2600
                </a>
              </div>
              <div className="telemetry-text text-sm text-pit-gray">
                <span className="text-telemetry-cyan">EMAIL://</span>
                <br />
                <a
                  href="mailto:mcsimracingfw@gmail.com"
                  className="hover:text-apex-red transition-colors"
                >
                  mcsimracingfw@gmail.com
                </a>
              </div>
            </address>
          </div>

          {/* Hours */}
          <div>
            <h4 className="racing-headline text-lg text-grid-white mb-6">
              Track Hours
            </h4>
            <div className="space-y-2 telemetry-text text-sm">
              <div className="flex justify-between text-pit-gray">
                <span>MON</span>
                <span className="text-telemetry-cyan">Reservations Only</span>
              </div>
              <div className="flex justify-between text-pit-gray">
                <span>TUE - THU</span>
                <span className="text-grid-white">Noon - Midnight</span>
              </div>
              <div className="flex justify-between text-pit-gray">
                <span>FRI - SAT</span>
                <span className="text-grid-white">Noon - 2AM</span>
              </div>
              <div className="flex justify-between text-pit-gray">
                <span>SUN</span>
                <span className="text-grid-white">Noon - Midnight</span>
              </div>
            </div>
            <div className="mt-6 p-3 bg-apex-red/10 border border-apex-red/30">
              <p className="telemetry-text text-xs text-apex-red">
                ALWAYS OPEN FOR RESERVATIONS
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="telemetry-text text-xs text-pit-gray">
            &copy; {currentYear} MC Racing Sim Fort Wayne. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="telemetry-text text-xs text-pit-gray hover:text-apex-red transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="telemetry-text text-xs text-pit-gray hover:text-apex-red transition-colors"
            >
              Terms
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {/* Social Icons */}
            <a
              href="#"
              aria-label="Facebook"
              className="w-8 h-8 flex items-center justify-center border border-white/10 hover:border-apex-red hover:bg-apex-red/10 transition-all"
            >
              <svg className="w-4 h-4 text-pit-gray" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.77,7.46H14.5v-1.9c0-.9.6-1.1,1-1.1h3V.5h-4.33C10.24.5,9.5,3.44,9.5,5.32v2.15h-3v4h3v12h5v-12h3.85l.42-4Z"/>
              </svg>
            </a>
            <a
              href="#"
              aria-label="Instagram"
              className="w-8 h-8 flex items-center justify-center border border-white/10 hover:border-apex-red hover:bg-apex-red/10 transition-all"
            >
              <svg className="w-4 h-4 text-pit-gray" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,2.16c3.2,0,3.58,0,4.85.07,3.25.15,4.77,1.69,4.92,4.92.06,1.27.07,1.65.07,4.85s0,3.58-.07,4.85c-.15,3.23-1.66,4.77-4.92,4.92-1.27.06-1.65.07-4.85.07s-3.58,0-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.65-.07-4.85s0-3.58.07-4.85C2.38,3.92,3.9,2.38,7.15,2.23,8.42,2.18,8.8,2.16,12,2.16ZM12,0C8.74,0,8.33,0,7.05.07c-4.27.2-6.78,2.71-7,7C0,8.33,0,8.74,0,12s0,3.67.07,4.95c.2,4.27,2.71,6.78,7,7C8.33,24,8.74,24,12,24s3.67,0,4.95-.07c4.27-.2,6.78-2.71,7-7C24,15.67,24,15.26,24,12s0-3.67-.07-4.95c-.2-4.27-2.71-6.78-7-7C15.67,0,15.26,0,12,0Zm0,5.84A6.16,6.16,0,1,0,18.16,12,6.16,6.16,0,0,0,12,5.84ZM12,16a4,4,0,1,1,4-4A4,4,0,0,1,12,16ZM18.41,4.15a1.44,1.44,0,1,0,1.44,1.44A1.44,1.44,0,0,0,18.41,4.15Z"/>
              </svg>
            </a>
            <a
              href="#"
              aria-label="YouTube"
              className="w-8 h-8 flex items-center justify-center border border-white/10 hover:border-apex-red hover:bg-apex-red/10 transition-all"
            >
              <svg className="w-4 h-4 text-pit-gray" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.5,6.19a3.02,3.02,0,0,0-2.12-2.14C19.5,3.5,12,3.5,12,3.5s-7.5,0-9.38.55A3.02,3.02,0,0,0,.5,6.19,31.69,31.69,0,0,0,0,12a31.69,31.69,0,0,0,.5,5.81,3.02,3.02,0,0,0,2.12,2.14c1.88.55,9.38.55,9.38.55s7.5,0,9.38-.55a3.02,3.02,0,0,0,2.12-2.14A31.69,31.69,0,0,0,24,12,31.69,31.69,0,0,0,23.5,6.19ZM9.55,15.57V8.43L15.82,12Z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Credit */}
      <div className="border-t border-white/5 py-4 text-center">
        <p className="text-xs text-pit-gray/60">
          Site by{' '}
          <a
            href="https://sweetdreams.us"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-grid-white transition-colors"
            style={{ fontFamily: "'Anton', sans-serif" }}
          >
            Sweet Dreams
          </a>
        </p>
      </div>
    </footer>
  )
}
