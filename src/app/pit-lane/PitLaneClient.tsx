'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Image from 'next/image'
import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'
import ScrambleText from '@/components/ScrambleText'

gsap.registerPlugin(ScrollTrigger)

export default function PitLaneClient() {
  const heroRef = useRef<HTMLDivElement>(null)
  const corporateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.pitlane-hero-content > *',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: 'power3.out' }
      )

      gsap.fromTo('.corporate-content',
        { y: 60, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: corporateRef.current, start: 'top 85%', once: true },
        }
      )

      gsap.fromTo('.faq-item',
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.4, stagger: 0.08, ease: 'power2.out',
          scrollTrigger: { trigger: '.faq-section', start: 'top 85%', once: true },
        }
      )
    })

    return () => ctx.revert()
  }, [])

  return (
    <>
      {/* Hero */}
      <section ref={heroRef} className="relative pt-32 pb-20 bg-asphalt-dark overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-apex-red/50 to-transparent" />
        <div className="absolute inset-0 opacity-90">
          <Image src="/assets/RCCarsSmallLinedUp.webp" alt="RC cars lined up at MC Racing Sim" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-asphalt-dark via-asphalt-dark/80 to-asphalt-dark" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pitlane-hero-content">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">// Parties & Events</span>
          <h1 className="racing-headline text-5xl md:text-6xl lg:text-7xl text-grid-white mb-6">
            <ScrambleText text="Birthday Parties" />
            <span className="text-apex-red"> & Corporate Events</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-2xl mb-8">
            Epic for them. Effortless for you. With 3 sims, kids rotate through in groups of 3.
            More time = more rotations = more race time per kid.
          </p>
          <div className="flex flex-wrap gap-4">
            <Button href="#birthday-pricing" size="lg">Birthday Parties</Button>
            <Button href="#corporate" variant="secondary" size="lg">Corporate Events</Button>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Birthday Party Pricing */}
      <section id="birthday-pricing" className="py-20 bg-asphalt-dark">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Birthday Parties
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              Party <span className="text-apex-red">Pricing</span>
            </h2>
            <p className="telemetry-text text-pit-gray max-w-xl mx-auto">
              With 3 sims, kids rotate through in groups of 3. More time = more rotations = more race time per kid.
            </p>
          </div>

          {/* Main Pricing Table */}
          <div className="overflow-x-auto bg-asphalt border border-white/10 mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">Duration</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">Up to 6 Kids</th>
                  <th className="text-center telemetry-text text-apex-red uppercase tracking-wider py-4 px-4">7-9 Kids</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">10-12 Kids</th>
                </tr>
              </thead>
              <tbody className="telemetry-text">
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4 font-bold">1.5 Hours</td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$300</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$375</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$450</span></td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4 font-bold">2 Hours</td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$400</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$475</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$550</span></td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4 font-bold">2.5 Hours</td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$475</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$550</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$650</span></td>
                </tr>
                <tr>
                  <td className="text-grid-white py-4 px-4 font-bold">3 Hours</td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$550</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$650</span></td>
                  <td className="text-center text-grid-white py-4 px-4"><span className="racing-headline text-xl">$750</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Per-Kid Breakdown */}
          <div className="overflow-x-auto bg-asphalt-dark border border-white/10 mb-8">
            <div className="p-4 border-b border-white/10">
              <h3 className="racing-headline text-lg text-grid-white text-center">
                <span className="text-telemetry-cyan">// </span>Per-Kid Breakdown
              </h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">Duration</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">6 Kids</th>
                  <th className="text-center telemetry-text text-apex-red uppercase tracking-wider py-4 px-4">9 Kids</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">12 Kids</th>
                </tr>
              </thead>
              <tbody className="telemetry-text">
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4">1.5 Hours</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$50/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$42/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$38/kid</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4">2 Hours</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$67/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$53/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$46/kid</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-grid-white py-4 px-4">2.5 Hours</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$79/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$61/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$54/kid</td>
                </tr>
                <tr>
                  <td className="text-grid-white py-4 px-4">3 Hours</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$92/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$72/kid</td>
                  <td className="text-center text-telemetry-cyan py-4 px-4">$63/kid</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-center mt-12">
            <Button href="tel:+18082202600" size="lg">Book a Birthday Party</Button>
            <p className="telemetry-text text-sm text-pit-gray mt-4">
              Call us at <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">(808) 220-2600</a> or
              email <a href="mailto:mcsimracingfw@gmail.com" className="text-telemetry-cyan hover:underline">mcsimracingfw@gmail.com</a>
            </p>
          </div>
        </div>
      </section>

      <SectionDivider variant="gradient" />

      {/* Corporate Events */}
      <section id="corporate" ref={corporateRef} className="py-20 bg-asphalt">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="corporate-content">
              <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">// Corporate Events</span>
              <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-6">
                <ScrambleText text="Team Building" /> at<span className="text-apex-red"> 200 MPH</span>
              </h2>
              <p className="telemetry-text text-pit-gray leading-relaxed mb-8">
                Settle the office rivalry on the track. Our corporate packages deliver an unforgettable team experience that actually brings people together—through competition.
              </p>
              <ul className="space-y-4 mb-8">
                {['Private facility rental', 'Custom championship formats', 'Team standings and awards', 'Catering coordination available', 'AV setup for presentations', 'Flexible scheduling'].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 telemetry-text text-grid-white">
                    <span className="w-2 h-2 bg-telemetry-cyan transform rotate-45" />{feature}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-4">
                <Button href="mailto:mcsimracingfw@gmail.com">Request Quote</Button>
                <Button variant="secondary" href="tel:+18082202600">Call (808) 220-2600</Button>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square bg-asphalt-dark border border-white/10 overflow-hidden">
                <Image src="/assets/GroupParty.webp" alt="Group event at MC Racing Sim" fill className="object-cover opacity-60" />
                <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-transparent to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-24 h-24 mx-auto mb-6 border-2 border-telemetry-cyan/50 rounded-full flex items-center justify-center bg-asphalt/80">
                      <svg className="w-12 h-12 text-telemetry-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="racing-headline text-2xl text-grid-white mb-2">Groups of 6-30</p>
                    <p className="telemetry-text text-pit-gray">Custom packages available</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* FAQ */}
      <section className="faq-section py-20 bg-asphalt-dark">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="racing-headline text-3xl md:text-4xl text-grid-white mb-4">
              Frequently Asked<span className="text-telemetry-cyan"> Questions</span>
            </h2>
          </div>
          <div className="space-y-4">
            {[
              { q: 'What ages are appropriate for birthday parties?', a: 'Our simulators work great for ages 8 and up. Drivers must be 12+ years old and 42+ inches tall. The RC track is suitable for all ages with parental supervision.' },
              { q: 'How does the rotation work with 3 sims?', a: 'Kids rotate through in groups of 3. While one group races, the others hang out, eat, and play on the RC track. More time means more rotations and more race time per kid.' },
              { q: 'Can we bring our own food and cake?', a: 'Yes! You are welcome to bring food, cake, and decorations. We have a dedicated party space with tables and chairs.' },
              { q: 'What if someone has never raced before?', a: 'No experience needed! Our Race Director will provide a full briefing and our simulators have adjustable difficulty settings.' },
              { q: 'How far in advance should we book?', a: 'We recommend booking at least 2 weeks in advance, especially for weekend parties. Popular dates fill up fast.' },
              { q: 'Is there a deposit required?', a: 'Yes, a 50% deposit is required to secure your booking. The remaining balance is due on the day of the event.' },
            ].map((faq, i) => (
              <details key={i} className="faq-item group bg-asphalt border border-white/10 hover:border-white/20 transition-colors">
                <summary className="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span className="racing-headline text-lg text-grid-white pr-4">{faq.q}</span>
                  <span className="w-6 h-6 border border-white/30 flex items-center justify-center flex-shrink-0 group-open:bg-apex-red group-open:border-apex-red transition-all">
                    <svg className="w-4 h-4 text-pit-gray group-open:text-white group-open:rotate-45 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                </summary>
                <div className="px-6 pb-6"><p className="telemetry-text text-pit-gray">{faq.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
