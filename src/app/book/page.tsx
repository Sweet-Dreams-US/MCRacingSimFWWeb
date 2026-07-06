import { Metadata } from 'next'
import BookingFlow from '@/components/booking/BookingFlow'

export const metadata: Metadata = {
  title: 'Book Your Session | MC Racing Sim Fort Wayne',
  description:
    'Reserve your sim racing session in Fort Wayne in under 2 minutes. $0 due today — pay when you race. Pro-grade $20K rigs, real physics, up to 3 racers. Book online or call (808) 220-2600.',
}

// Small presentational helpers kept local to this page — they only exist to
// give the funnel its rhythm and aren't reused elsewhere.
function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card-dark p-6 relative">
      <div className="racing-headline text-5xl text-apex-red/30 leading-none mb-3">
        {n.toString().padStart(2, '0')}
      </div>
      <h3 className="racing-headline text-xl text-grid-white mb-2">{title}</h3>
      <p className="telemetry-text text-sm text-pit-gray leading-relaxed">{body}</p>
    </div>
  )
}

// Compact trust-bar stat — sized to sit four-across cleanly (unlike the
// giant hero StatCounter, whose clamp(3rem,8vw,6rem) numbers collide here).
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-2">
      <div className="racing-headline text-3xl sm:text-4xl text-telemetry-cyan leading-none whitespace-nowrap">
        {value}
      </div>
      <p className="telemetry-text text-[11px] sm:text-xs text-pit-gray uppercase tracking-wider mt-2">
        {label}
      </p>
    </div>
  )
}

function FeatureCard({
  title,
  body,
  icon,
}: {
  title: string
  body: string
  icon: React.ReactNode
}) {
  return (
    <div className="card-dark p-6">
      <div className="text-telemetry-cyan mb-4">{icon}</div>
      <h3 className="racing-headline text-lg text-grid-white mb-2">{title}</h3>
      <p className="telemetry-text text-sm text-pit-gray leading-relaxed">{body}</p>
    </div>
  )
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <details className="card-dark group">
      <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4">
        <span className="racing-headline text-base text-grid-white">{q}</span>
        <span className="text-telemetry-cyan text-2xl leading-none transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="px-5 pb-5 -mt-1 telemetry-text text-sm text-pit-gray leading-relaxed">
        {a}
      </div>
    </details>
  )
}

const iconClass = 'w-8 h-8'
const svgProps = {
  className: iconClass,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export default function BookPage() {
  return (
    <main className="min-h-screen bg-asphalt">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden pt-28 pb-14 px-4">
        <div className="absolute inset-0 checkered-pattern opacity-[0.04] pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <p className="telemetry-text text-xs sm:text-sm text-telemetry-cyan uppercase tracking-[0.25em] mb-4">
            Fort Wayne&apos;s Pro Sim Racing Lounge
          </p>
          <h1 className="racing-headline text-4xl sm:text-5xl md:text-6xl text-grid-white mb-5 leading-tight">
            Book Your <span className="text-apex-red">Session</span>
          </h1>
          <p className="telemetry-text text-base sm:text-lg text-pit-gray max-w-2xl mx-auto mb-7">
            Real physics. No consequences. Lock in your spot on the grid in under two
            minutes — pick your time, your crew, and your track.
          </p>

          {/* Risk-reversal chip — the #1 objection, killed up front */}
          <div className="inline-flex items-center gap-2 bg-telemetry-cyan/10 border border-telemetry-cyan/30 px-4 py-2 mb-8">
            <svg {...svgProps} className="w-5 h-5 text-telemetry-cyan">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <span className="telemetry-text text-sm text-grid-white font-bold">
              $0 due today — pay when you race
            </span>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <a href="#book" className="btn-primary w-full sm:w-auto text-center px-8 py-4">
              Choose Your Time ↓
            </a>
            <a
              href="tel:+18082202600"
              className="btn-secondary w-full sm:w-auto text-center px-8 py-4"
            >
              Or Call (808) 220-2600
            </a>
          </div>

          {/* Trust stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8 max-w-3xl mx-auto border-t border-white/10 pt-10">
            <StatPill value="$20K+" label="Per Racing Rig" />
            <StatPill value="4,000+" label="Sq Ft Facility" />
            <StatPill value="Up to 3" label="Racers at Once" />
            <StatPill value="6 Days" label="Open Weekly" />
          </div>
        </div>
      </section>

      {/* ================= RISK REVERSAL BAND ================= */}
      <section className="px-4 pb-4">
        <div className="max-w-5xl mx-auto card-dark border-apex-red/30 p-6 sm:p-8 text-center">
          <h2 className="racing-headline text-2xl text-grid-white mb-2">
            Reserve Free. No Deposit.
          </h2>
          <p className="telemetry-text text-sm sm:text-base text-pit-gray max-w-2xl mx-auto">
            We save a card to hold your spot, but{' '}
            <span className="text-grid-white font-bold">you&apos;re not charged today</span>.
            Pay for your session when you arrive. The card is only used if you no-show —
            so your grid slot is guaranteed and so is ours.
          </p>
        </div>
      </section>

      {/* ================= BOOKING FORM ================= */}
      <section id="book" className="scroll-mt-24 px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="racing-headline text-3xl sm:text-4xl text-grid-white mb-3">
              Lock In Your <span className="text-telemetry-cyan">Grid Spot</span>
            </h2>
            <p className="telemetry-text text-pit-gray max-w-xl mx-auto">
              Choose your racers, duration, and time slot below.
            </p>
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

          <BookingFlow />
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="px-4 py-14 bg-asphalt-dark/40">
        <div className="max-w-5xl mx-auto">
          <h2 className="racing-headline text-3xl text-grid-white text-center mb-10">
            Three Steps to the <span className="text-apex-red">Green Flag</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StepCard
              n={1}
              title="Pick Your Time"
              body="Choose your date, how many racers, and how long you want on the rigs. See real availability instantly."
            />
            <StepCard
              n={2}
              title="Reserve Free"
              body="Save a card to hold your spot — $0 charged today. It only covers a no-show, so your slot is locked in."
            />
            <StepCard
              n={3}
              title="Show Up & Race"
              body="Walk in, gear up, and drop into pro-grade simulators. Pay for your session at the counter when you arrive."
            />
          </div>
        </div>
      </section>

      {/* ================= WHY RACE HERE ================= */}
      <section className="px-4 py-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="racing-headline text-3xl text-grid-white text-center mb-10">
            Why Racers Book <span className="text-telemetry-cyan">MC Racing</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              title="$20K Pro Rigs"
              body="Direct-drive wheels, load-cell pedals, and motion-ready seats — the same gear pro esports racers train on."
              icon={
                <svg {...svgProps}>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                </svg>
              }
            />
            <FeatureCard
              title="Real Physics, No Risk"
              body="Feel every apex and slide with true-to-life handling. Wreck with zero consequences and hit reset."
              icon={
                <svg {...svgProps}>
                  <path d="M3 12a9 9 0 1 0 9-9" />
                  <path d="M3 4v4h4" />
                  <path d="M12 7v5l3 2" />
                </svg>
              }
            />
            <FeatureCard
              title="Race With Your Crew"
              body="Book up to three racers to go wheel-to-wheel side by side. Perfect for friends, dates, and birthdays."
              icon={
                <svg {...svgProps}>
                  <circle cx="9" cy="8" r="3" />
                  <circle cx="17" cy="10" r="2.5" />
                  <path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6M16 20c0-2 1-3.5 3-3.5" />
                </svg>
              }
            />
            <FeatureCard
              title="Indoor RC Combo"
              body="Add our indoor RC track to your visit — book a sim session and get 50% off RC racing."
              icon={
                <svg {...svgProps}>
                  <rect x="3" y="10" width="18" height="6" rx="2" />
                  <circle cx="7.5" cy="18" r="1.5" />
                  <circle cx="16.5" cy="18" r="1.5" />
                  <path d="M8 10 10 6h4l2 4" />
                </svg>
              }
            />
            <FeatureCard
              title="Free Parking, Easy Access"
              body="1205 W Main St, Fort Wayne — a 4,000+ sq ft facility with free on-site parking, minutes from downtown."
              icon={
                <svg {...svgProps}>
                  <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
              }
            />
            <FeatureCard
              title="Beginners Welcome"
              body="Never touched a sim? Adjustable assists and on-hand staff get you comfortable fast — then push your limits."
              icon={
                <svg {...svgProps}>
                  <path d="M12 15l-5-3 5-3 5 3-5 3z" />
                  <path d="M7 12v3.5c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5V12" />
                </svg>
              }
            />
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section className="px-4 py-14 bg-asphalt-dark/40">
        <div className="max-w-3xl mx-auto">
          <h2 className="racing-headline text-3xl text-grid-white text-center mb-10">
            Before You <span className="text-apex-red">Book</span>
          </h2>
          <div className="space-y-3">
            <Faq
              q="Am I charged when I book?"
              a="No — $0 is charged today. We save a card only to hold your spot, and it's used solely if you don't show up. You pay for your session at the counter when you arrive."
            />
            <Faq
              q="Do I need racing experience?"
              a="Not at all. Our rigs have adjustable difficulty and driving aids, and staff are on hand to get you dialed in. We see everyone from total first-timers to seasoned sim racers."
            />
            <Faq
              q="Can I bring friends?"
              a="Yes — book up to three racers to compete side by side. It's one of the best ways to do a group hangout, date night, or birthday in Fort Wayne."
            />
            <Faq
              q="How long are sessions?"
              a="You choose 1, 2, or 3 hours when you book. Pricing updates automatically as you pick your racers and duration."
            />
            <Faq
              q="What if I'm running late?"
              a={
                <>
                  Give us a call at{' '}
                  <a href="tel:+18082202600" className="text-telemetry-cyan font-bold">
                    (808) 220-2600
                  </a>{' '}
                  and we&apos;ll do our best to hold your spot.
                </>
              }
            />
            <Faq
              q="Where are you located?"
              a="1205 W Main St, Fort Wayne, IN 46808 — a 4,000+ sq ft facility with free on-site parking, open six days a week (closed Mondays)."
            />
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="relative overflow-hidden px-4 py-16">
        <div className="absolute inset-0 checkered-pattern opacity-[0.04] pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="racing-headline text-3xl sm:text-4xl text-grid-white mb-4">
            Ready to Hit the <span className="text-apex-red">Track</span>?
          </h2>
          <p className="telemetry-text text-pit-gray mb-8 max-w-xl mx-auto">
            Your grid spot is one tap away. Reserve free now — decide nothing else until you
            arrive.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#book" className="btn-primary w-full sm:w-auto text-center px-8 py-4">
              Book My Session ↑
            </a>
            <a
              href="tel:+18082202600"
              className="btn-secondary w-full sm:w-auto text-center px-8 py-4"
            >
              Call (808) 220-2600
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
