'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Image from 'next/image'
import SectionDivider from '@/components/SectionDivider'
import ScrambleText from '@/components/ScrambleText'
import Button from '@/components/Button'

gsap.registerPlugin(ScrollTrigger)

const weekdayPricing = {
  label: 'Weekday',
  days: 'Tuesday - Thursday',
  data: [
    { people: 1, prices: [45, 85, 115] },
    { people: 2, prices: [90, 160, 220] },
    { people: 3, prices: [130, 245, 340] },
  ],
}

const weekendPricing = {
  label: 'Weekend',
  days: 'Friday - Sunday',
  data: [
    { people: 1, prices: [50, 95, 135] },
    { people: 2, prices: [100, 180, 250] },
    { people: 3, prices: [140, 275, 365] },
  ],
}

const techSpecs = [
  { label: 'Simulator Rigs', value: '3', unit: 'STATIONS' },
  { label: 'Force Feedback', value: '20', unit: 'NM TORQUE' },
  { label: 'Displays', value: '65"', unit: 'SCREENS' },
  { label: 'Refresh Rate', value: '240', unit: 'HZ' },
]

export default function GarageClient() {
  const heroRef = useRef<HTMLDivElement>(null)
  const pricingRef = useRef<HTMLDivElement>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    setIsLoaded(true)

    const timer = setTimeout(() => {
      ScrollTrigger.refresh()
    }, 100)

    const ctx = gsap.context(() => {
      gsap.fromTo('.garage-hero-content > *',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.15,
          ease: 'power3.out',
        }
      )

      gsap.fromTo('.pricing-card',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.15,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: pricingRef.current,
            start: 'top 85%',
            once: true,
          },
        }
      )

      gsap.fromTo('.tech-spec-item',
        { scale: 0.8, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'back.out(1.7)',
          scrollTrigger: {
            trigger: '.tech-section',
            start: 'top 85%',
            once: true,
          },
        }
      )

      gsap.fromTo('.grid-logic-item',
        { x: -40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.grid-logic-section',
            start: 'top 85%',
            once: true,
          },
        }
      )
    })

    return () => {
      clearTimeout(timer)
      ctx.revert()
    }
  }, [])

  return (
    <>
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-20 bg-asphalt-dark overflow-hidden"
      >
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-apex-red/50 to-transparent" />

        {/* Background image */}
        <div className="absolute inset-0 opacity-70">
          <Image
            src="/assets/MCRacingSignBest.webp"
            alt="MC Racing Sim Fort Wayne sign"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-asphalt-dark via-asphalt-dark/80 to-asphalt-dark" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 garage-hero-content">
          <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
            // The Garage
          </span>
          <h1 className="racing-headline text-5xl md:text-6xl lg:text-7xl text-grid-white mb-6">
            <ScrambleText text="Choose Your" />
            <span className="text-apex-red"> Class</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-2xl mb-8">
            From quick sprints to endurance sessions. Solo runs or full grid with your crew.
            Pick your session, we'll handle the rest.
          </p>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-6">
            {techSpecs.map((spec, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="racing-headline text-3xl text-telemetry-cyan">{spec.value}</span>
                <span className="telemetry-text text-xs text-pit-gray uppercase">{spec.unit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Book Now Section */}
      <section id="booking" className="py-20 bg-asphalt-dark">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Book Your Session
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              Ready to Hit
              <span className="text-telemetry-cyan"> The Grid?</span>
            </h2>
            <p className="telemetry-text text-pit-gray max-w-xl mx-auto mb-8">
              Give us a call to book your session. Choose your date, time, and number of racers.
            </p>

            {/* Call to Book CTA */}
            <Button href="tel:+18082202600" size="lg">
              Call to Book: (808) 220-2600
            </Button>

            {/* Email option */}
            <p className="telemetry-text text-pit-gray mt-6 mb-4">
              or email us at{' '}
              <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan hover:underline">
                mcsimracingfw@gmail.com
              </a>
            </p>

            {/* Driver Requirements */}
            <div className="mt-8 p-4 bg-asphalt border border-white/10 inline-block">
              <p className="telemetry-text text-xs text-pit-gray">
                <span className="text-telemetry-cyan">REQUIREMENTS://</span> Drivers must be 12+ years old and 42+ inches tall
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Two Photo Section - Racing for Everyone */}
      <section className="py-20 bg-asphalt">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
              // Racing for Everyone
            </span>
            <h2 className="racing-headline text-3xl md:text-4xl text-grid-white">
              All Ages.
              <span className="text-apex-red"> All Skill Levels.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Kid Racing Photo */}
            <div className="relative aspect-[16/10] overflow-hidden group">
              <Image
                src="/assets/KidRacing.webp"
                alt="Young racer enjoying the simulator"
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-transparent to-transparent opacity-60" />
              <div className="absolute inset-0 border border-telemetry-cyan/20 group-hover:border-telemetry-cyan/40 transition-colors" />
              <div className="absolute bottom-0 left-0 w-16 h-1 bg-telemetry-cyan" />
              <div className="absolute bottom-0 left-0 w-1 h-16 bg-telemetry-cyan" />
            </div>

            {/* Dad Racing Photo */}
            <div className="relative aspect-[16/10] overflow-hidden group">
              <Image
                src="/assets/FocusedDadRacing.webp"
                alt="Focused racer in the simulator"
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-transparent to-transparent opacity-60" />
              <div className="absolute inset-0 border border-apex-red/20 group-hover:border-apex-red/40 transition-colors" />
              <div className="absolute bottom-0 right-0 w-16 h-1 bg-apex-red" />
              <div className="absolute bottom-0 right-0 w-1 h-16 bg-apex-red" />
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Pricing Section */}
      <section ref={pricingRef} className="py-20 bg-asphalt-dark">
        <div className="max-w-7xl mx-auto px-6">
          {/* Pricing Header */}
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Session Rates
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              Sim Racing
              <span className="text-apex-red"> Pricing</span>
            </h2>
            <p className="telemetry-text text-pit-gray mb-4">
              <span className="text-telemetry-cyan">TIP://</span> Book as a group and save on every session
            </p>
          </div>

          {/* Pricing Tables */}
          <div className="grid lg:grid-cols-2 gap-8 mb-16">
            {/* Weekday Pricing */}
            <div className="pricing-card bg-asphalt-dark border border-telemetry-cyan/30 overflow-hidden" style={{ opacity: isLoaded ? undefined : 1 }}>
              <div className="bg-telemetry-cyan py-4 px-6">
                <h3 className="racing-headline text-2xl text-white text-center">{weekdayPricing.label}</h3>
                <p className="telemetry-text text-sm text-white/80 text-center">{weekdayPricing.days}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">People</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">1 Hour</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">2 Hours</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">3 Hours</th>
                    </tr>
                  </thead>
                  <tbody className="telemetry-text">
                    {weekdayPricing.data.map((row, i) => (
                      <tr key={row.people} className={i < weekdayPricing.data.length - 1 ? 'border-b border-white/10' : ''}>
                        <td className="py-4 px-4">
                          <span className="text-telemetry-cyan font-bold">{row.people}</span>
                          <span className="text-pit-gray"> {row.people === 1 ? 'Person' : 'People'}</span>
                        </td>
                        {row.prices.map((price, j) => (
                          <td key={j} className="text-center text-grid-white py-4 px-4">
                            <span className="racing-headline text-xl">${price}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Weekend Pricing */}
            <div className="pricing-card bg-asphalt-dark border border-apex-red/30 overflow-hidden" style={{ opacity: isLoaded ? undefined : 1 }}>
              <div className="bg-apex-red py-4 px-6">
                <h3 className="racing-headline text-2xl text-white text-center">{weekendPricing.label}</h3>
                <p className="telemetry-text text-sm text-white/80 text-center">{weekendPricing.days}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">People</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">1 Hour</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">2 Hours</th>
                      <th className="text-center telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">3 Hours</th>
                    </tr>
                  </thead>
                  <tbody className="telemetry-text">
                    {weekendPricing.data.map((row, i) => (
                      <tr key={row.people} className={i < weekendPricing.data.length - 1 ? 'border-b border-white/10' : ''}>
                        <td className="py-4 px-4">
                          <span className="text-apex-red font-bold">{row.people}</span>
                          <span className="text-pit-gray"> {row.people === 1 ? 'Person' : 'People'}</span>
                        </td>
                        {row.prices.map((price, j) => (
                          <td key={j} className="text-center text-grid-white py-4 px-4">
                            <span className="racing-headline text-xl">${price}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Full Comparison Table */}
          <div className="mb-16">
            <div className="text-center mb-8">
              <h3 className="racing-headline text-2xl text-grid-white">
                Full <span className="text-telemetry-cyan">Price Comparison</span>
              </h3>
            </div>
            <div className="overflow-x-auto bg-asphalt border border-white/10">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-3">Session</th>
                    <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-3" colSpan={3}>
                      Weekday (Tue-Thu)
                    </th>
                    <th className="text-center telemetry-text text-apex-red uppercase tracking-wider py-4 px-3" colSpan={3}>
                      Weekend (Fri-Sun)
                    </th>
                  </tr>
                  <tr className="border-b border-white/10">
                    <th className="text-left telemetry-text text-pit-gray py-2 px-3"></th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">1hr</th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">2hr</th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">3hr</th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">1hr</th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">2hr</th>
                    <th className="text-center telemetry-text text-pit-gray text-xs py-2 px-3">3hr</th>
                  </tr>
                </thead>
                <tbody className="telemetry-text">
                  <tr className="border-b border-white/10">
                    <td className="text-pit-gray py-4 px-3">1 Person</td>
                    <td className="text-center text-grid-white py-4 px-3">$45</td>
                    <td className="text-center text-grid-white py-4 px-3">$85</td>
                    <td className="text-center text-grid-white py-4 px-3">$115</td>
                    <td className="text-center text-grid-white py-4 px-3">$50</td>
                    <td className="text-center text-grid-white py-4 px-3">$95</td>
                    <td className="text-center text-grid-white py-4 px-3">$135</td>
                  </tr>
                  <tr className="border-b border-white/10">
                    <td className="text-pit-gray py-4 px-3">2 People</td>
                    <td className="text-center text-grid-white py-4 px-3">$90</td>
                    <td className="text-center text-grid-white py-4 px-3">$160</td>
                    <td className="text-center text-grid-white py-4 px-3">$220</td>
                    <td className="text-center text-grid-white py-4 px-3">$100</td>
                    <td className="text-center text-grid-white py-4 px-3">$180</td>
                    <td className="text-center text-grid-white py-4 px-3">$250</td>
                  </tr>
                  <tr>
                    <td className="text-pit-gray py-4 px-3">3 People</td>
                    <td className="text-center text-grid-white py-4 px-3">$130</td>
                    <td className="text-center text-grid-white py-4 px-3">$245</td>
                    <td className="text-center text-grid-white py-4 px-3">$340</td>
                    <td className="text-center text-grid-white py-4 px-3">$140</td>
                    <td className="text-center text-grid-white py-4 px-3">$275</td>
                    <td className="text-center text-grid-white py-4 px-3">$365</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 p-4 bg-asphalt-dark border border-white/10">
              <p className="telemetry-text text-sm text-pit-gray text-center">
                <span className="text-telemetry-cyan font-bold">Note:</span> All prices are per session, not per person.
                Book a 3-person, 2-hour session and everyone races together.
              </p>
            </div>
          </div>

          {/* Grid Logic Section */}
          <div className="grid-logic-section max-w-4xl mx-auto">
            <div className="bg-asphalt border border-white/10 p-8">
              <h3 className="racing-headline text-2xl text-grid-white mb-6">
                <span className="text-telemetry-cyan">// </span>
                The Grid Logic
              </h3>

              <div className="space-y-4">
                <div className="grid-logic-item flex items-start gap-4">
                  <div className="w-8 h-8 bg-apex-red/20 flex items-center justify-center flex-shrink-0">
                    <span className="racing-headline text-sm text-apex-red">01</span>
                  </div>
                  <div>
                    <p className="telemetry-text text-grid-white mb-1">Team Entry Discount</p>
                    <p className="telemetry-text text-sm text-pit-gray">
                      Book all 3 simulators as a group and get a discounted rate per driver.
                    </p>
                  </div>
                </div>

                <div className="grid-logic-item flex items-start gap-4">
                  <div className="w-8 h-8 bg-apex-red/20 flex items-center justify-center flex-shrink-0">
                    <span className="racing-headline text-sm text-apex-red">02</span>
                  </div>
                  <div>
                    <p className="telemetry-text text-grid-white mb-1">Call to Book</p>
                    <p className="telemetry-text text-sm text-pit-gray">
                      Sessions are limited to 3 seats. Call us to reserve your spot on the grid.
                    </p>
                  </div>
                </div>

                <div className="grid-logic-item flex items-start gap-4">
                  <div className="w-8 h-8 bg-apex-red/20 flex items-center justify-center flex-shrink-0">
                    <span className="racing-headline text-sm text-apex-red">03</span>
                  </div>
                  <div>
                    <p className="telemetry-text text-grid-white mb-1">Exclusive Time Block</p>
                    <p className="telemetry-text text-sm text-pit-gray">
                      Your team gets the entire facility. No strangers, just racing.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* What to Expect Section */}
      <section className="tech-section py-20 bg-asphalt">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
              // Tech Inspection
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              <ScrambleText text="The Protocol" />
            </h2>
            <p className="telemetry-text text-pit-gray max-w-xl mx-auto">
              Every session follows our driver briefing protocol. Here's what to expect.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Check-In',
                description: 'Arrive 10 minutes early. Sign the digital waiver and get your pit pass.',
                icon: '📋',
              },
              {
                step: '02',
                title: 'Driver Briefing',
                description: 'Learn the controls, safety protocols, and track selection.',
                icon: '🎓',
              },
              {
                step: '03',
                title: 'Seat Time',
                description: 'Get fitted in your rig. We adjust everything to your specs.',
                icon: '🏎️',
              },
              {
                step: '04',
                title: 'Green Flag',
                description: 'Hit the track. Your session time starts when you go green.',
                icon: '🏁',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="tech-spec-item bg-asphalt-dark p-6 border border-white/5 hover:border-telemetry-cyan/30 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-4xl">{item.icon}</span>
                  <span className="racing-headline text-2xl text-apex-red/50 group-hover:text-apex-red transition-colors">
                    {item.step}
                  </span>
                </div>
                <h3 className="racing-headline text-lg text-grid-white mb-2">
                  {item.title}
                </h3>
                <p className="telemetry-text text-sm text-pit-gray">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          {/* Final CTA */}
          <div className="text-center mt-16">
            <Button href="tel:+18082202600" size="lg">
              Call to Book: (808) 220-2600
            </Button>
            <p className="telemetry-text text-sm text-pit-gray mt-4">
              Questions? Email us at <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan hover:underline">mcsimracingfw@gmail.com</a>
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
