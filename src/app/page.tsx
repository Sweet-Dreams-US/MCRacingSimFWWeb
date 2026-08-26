'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Image from 'next/image'
import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'
import StatCounter from '@/components/StatCounter'
import ScrambleText from '@/components/ScrambleText'
import ReviewsMarquee from '@/components/ReviewsMarquee'

gsap.registerPlugin(ScrollTrigger)


// ---------------------------------------------------------------------------
// Hero configuration
// ---------------------------------------------------------------------------

// Drop a short, muted, looping clip in /public/assets and point this at it
// (e.g. '/assets/hero.mp4') to run video behind the header. Left empty the
// hero uses the still image instead, so nothing breaks while it's missing.
const HERO_VIDEO = ''

// Shown under the logo. Kept here so they're corrected in one place rather
// than hunted through the markup — update if the rating ever moves.
const REVIEW_RATING = 5.0
const REVIEW_HEADLINE = '100% five-star reviews on Google'

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<HTMLDivElement>(null)
  const rcRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Small delay to ensure DOM is fully ready
    const timer = setTimeout(() => {
      ScrollTrigger.refresh()
    }, 100)

    const ctx = gsap.context(() => {
      // Hero animations - use fromTo for reliability
      gsap.fromTo('.hero-title',
        { y: 100, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, ease: 'power4.out' }
      )
      gsap.fromTo('.hero-subtitle',
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', delay: 0.3 }
      )
      gsap.fromTo('.hero-cta',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out', delay: 0.5 }
      )

      // Stats section - set initial state immediately visible, then animate
      gsap.set('.stat-item', { opacity: 1, y: 0 })
      gsap.fromTo('.stat-item',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.stats-section',
            start: 'top 90%',
            once: true,
          },
        }
      )

      // Sim section scroll animations
      gsap.fromTo('.sim-content',
        { x: -80, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: simRef.current,
            start: 'top 75%',
            once: true,
          },
        }
      )

      gsap.fromTo('.sim-visual',
        { x: 80, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: simRef.current,
            start: 'top 75%',
            once: true,
          },
        }
      )

      // RC section scroll animations
      gsap.fromTo('.rc-content',
        { x: 80, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: rcRef.current,
            start: 'top 75%',
            once: true,
          },
        }
      )

      gsap.fromTo('.rc-visual',
        { x: -80, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: rcRef.current,
            start: 'top 75%',
            once: true,
          },
        }
      )

      // CTA section
      gsap.fromTo('.cta-content',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ctaRef.current,
            start: 'top 80%',
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
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
      >
        {/* Background: looping video at low opacity, falling back to the still
            image. The <video> only renders if HERO_VIDEO is set below — drop a
            file in /public/assets and point this at it. Until then the poster
            image shows exactly as before, so the hero never breaks. */}
        <div className="absolute inset-0 bg-asphalt-dark">
          {HERO_VIDEO ? (
            <video
              className="absolute inset-0 w-full h-full object-cover opacity-20"
              src={HERO_VIDEO}
              poster="/assets/WideTwoRacingBays.webp"
              autoPlay
              muted
              loop
              playsInline
              // Decorative only — never announce it to screen readers.
              aria-hidden="true"
            />
          ) : (
            <Image
              src="/assets/WideTwoRacingBays.webp"
              alt="MC Racing Sim Fort Wayne racing bays"
              fill
              className="object-cover opacity-30"
              priority
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-asphalt/50 via-asphalt/70 to-asphalt z-10" />
          {/* Grid pattern overlay */}
          <div className="absolute inset-0 grid-bg opacity-30" />
          {/* Animated lines */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute top-1/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-apex-red/50 to-transparent racing-stripe" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-telemetry-cyan/30 to-transparent" />
            <div className="absolute top-3/4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-apex-red/20 to-transparent" />
          </div>
          {/* Scan lines effect */}
          <div className="absolute inset-0 scan-lines opacity-20" />
        </div>

        {/* Hero Content */}
        <div className="relative z-20 max-w-6xl mx-auto px-6 text-center">
          {/* Rating leads the hero — the logo already sits in the nav, so a
              second copy here was redundant. Social proof before the pitch. */}
          <div className="hero-title flex flex-col items-center gap-1 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-xl tracking-[0.2em] text-apex-red" aria-hidden="true">
                ★★★★★
              </span>
              <span className="telemetry-text text-sm text-grid-white font-bold">
                {REVIEW_RATING.toFixed(1)}
              </span>
            </div>
            <p className="telemetry-text text-xs sm:text-sm text-pit-gray uppercase tracking-wider">
              {REVIEW_HEADLINE}
            </p>
          </div>

          {/* Real reviews scrolling at the top of the hero — social proof in
              the customers' own words, before any of our own copy. */}
          <div className="hero-title mb-8">
            <ReviewsMarquee />
          </div>

          <h1 className="hero-subtitle racing-headline text-3xl md:text-5xl text-grid-white mb-4 leading-tight">
            {/* Deliberately NOT ScrambleText: it needs 3x text.length ticks,
                so a headline this long stays unreadable for ~4.5s. The main
                message has to land instantly. */}
            Fort Wayne&apos;s Fastest Night Out
          </h1>

          <p className="hero-subtitle telemetry-text text-lg md:text-xl text-pit-gray max-w-2xl mx-auto mb-10">
            Pro-grade racing simulators and an indoor RC track. Genuinely
            extreme, completely safe, and{' '}
            <span className="text-grid-white">open late</span>.
            <span className="block text-telemetry-cyan mt-2">
              1205 W Main St, Fort Wayne.
            </span>
          </p>

          <div className="hero-cta flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/book" size="lg">
              Book Online
            </Button>
            <Button href="/pricing" variant="secondary" size="lg">
              View Pricing
            </Button>
          </div>
          <p className="hero-cta telemetry-text text-sm text-pit-gray mt-4 text-center">
            Prefer to book by phone?{' '}
            <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">Call (808) 220-2600</a>
          </p>

        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-asphalt to-transparent z-10" />
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-apex-red via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-1 h-full bg-gradient-to-b from-telemetry-cyan via-transparent to-transparent" />
      </section>

      {/* Stats Section */}
      <section className="stats-section py-16 bg-asphalt-dark border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCounter
              value={3}
              label="Pro-Grade Simulators"
              suffix=""
              className="stat-item"
            />
            <StatCounter
              value={4000}
              label="Sq Ft Facility"
              suffix="+"
              className="stat-item"
            />
            <StatCounter
              value={200}
              label="MPH Top Speed"
              suffix="+"
              className="stat-item"
            />
            <StatCounter
              value={1}
              label="Of a Kind in Fort Wayne"
              suffix=""
              className="stat-item"
              prefix="#"
            />
          </div>
        </div>
      </section>

      {/* Perfect for Parties — sits straight after the reviews/stats so the
          group-booking audience sees itself before scrolling into the detail. */}
      <section className="py-20 md:py-28 bg-asphalt relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-3">
              // Groups
            </p>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              Perfect For <span className="text-apex-red">Parties</span>
            </h2>
            <p className="telemetry-text text-pit-gray max-w-2xl mx-auto">
              Book the sims, the RC track, and the lounge for your group.
              <span className="block text-grid-white mt-1">
                Food and drinks are welcome — bring your own.
              </span>
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: 'Corporate Events',
                copy: 'Team building at 200 mph. Settle the office rivalry on the track.',
              },
              {
                title: 'Birthday Parties',
                copy: 'Epic for them, effortless for you. We run the grid, you enjoy it.',
              },
              {
                title: 'Bachelor Parties',
                copy: 'Start the night here. Open late, and nobody has to drive to race.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="border border-white/10 bg-asphalt-dark p-6 hover:border-apex-red/40 transition-colors"
              >
                <h3 className="racing-headline text-xl text-grid-white mb-2">{c.title}</h3>
                <p className="telemetry-text text-sm text-pit-gray">{c.copy}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Button href="/pit-lane" size="lg">
              Plan Your Party
            </Button>
            <p className="telemetry-text text-sm text-pit-gray mt-4">
              Or call{' '}
              <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">
                (808) 220-2600
              </a>{' '}
              and we&apos;ll build the package with you.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Why MC Racing Video Section */}
      <section className="py-24 md:py-32 bg-asphalt relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Our Story
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl lg:text-6xl text-grid-white mb-6">
              <ScrambleText text="Why" />
              <span className="text-telemetry-cyan"> MC Racing?</span>
            </h2>
            <p className="telemetry-text text-pit-gray max-w-2xl mx-auto">
              A passion built by racers, but for everyone to experience the absolute blast
              that real race car drivers get to experience.
            </p>
          </div>

          {/* Video Container */}
          <div className="relative max-w-4xl mx-auto">
            <div className="relative aspect-video bg-asphalt-dark border border-white/10 overflow-hidden">
              <iframe
                src="https://customer-w6h9o08eg118alny.cloudflarestream.com/a279eed7ef4ceef1b3b257b0fb4dfc67/iframe?poster=https%3A%2F%2Fcustomer-w6h9o08eg118alny.cloudflarestream.com%2Fa279eed7ef4ceef1b3b257b0fb4dfc67%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D2m19s"
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
              />
            </div>
            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-8 h-1 bg-apex-red" />
            <div className="absolute top-0 left-0 w-1 h-8 bg-apex-red" />
            <div className="absolute top-0 right-0 w-8 h-1 bg-telemetry-cyan" />
            <div className="absolute top-0 right-0 w-1 h-8 bg-telemetry-cyan" />
            <div className="absolute bottom-0 left-0 w-8 h-1 bg-telemetry-cyan" />
            <div className="absolute bottom-0 left-0 w-1 h-8 bg-telemetry-cyan" />
            <div className="absolute bottom-0 right-0 w-8 h-1 bg-apex-red" />
            <div className="absolute bottom-0 right-0 w-1 h-8 bg-apex-red" />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Simulators Section */}
      <section ref={simRef} className="py-24 md:py-32 bg-asphalt relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Content */}
            <div className="sim-content order-2 lg:order-1">
              <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
                // The Hardware
              </span>
              <h2 className="racing-headline text-4xl md:text-5xl lg:text-6xl text-grid-white mb-6">
                <ScrambleText text="This Isn't An" />
                <span className="text-apex-red"> Arcade Game</span>
              </h2>
              <p className="telemetry-text text-pit-gray leading-relaxed mb-8">
                It's training hardware. Feel every bump, curb, and loss of traction on
                ultra-realistic rigs used by professional drivers worldwide.
              </p>

              <ul className="space-y-4 mb-8">
                {[
                  'Direct-drive force feedback wheels',
                  'Hydraulic handbrake',
                  'Triple 65" immersive displays',
                  'Pro racing H-pattern shifter',
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 telemetry-text text-grid-white">
                    <span className="w-2 h-2 bg-apex-red transform rotate-45" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button href="/pricing">
                Explore The Grid
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Button>
            </div>

            {/* Visual */}
            <div className="sim-visual order-1 lg:order-2 relative">
              <div className="relative aspect-[4/3] bg-asphalt-light overflow-hidden">
                <Image
                  src="/assets/SimRacer.webp"
                  alt="Professional racing simulator with triple 65-inch screens"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-transparent to-transparent opacity-60" />
                {/* Glowing border */}
                <div className="absolute inset-0 border border-apex-red/20" />
                <div className="absolute top-0 left-0 w-16 h-1 bg-apex-red" />
                <div className="absolute top-0 left-0 w-1 h-16 bg-apex-red" />
                <div className="absolute bottom-0 right-0 w-16 h-1 bg-telemetry-cyan" />
                <div className="absolute bottom-0 right-0 w-1 h-16 bg-telemetry-cyan" />
              </div>
              {/* Stats overlay */}
              <div className="absolute -bottom-6 -right-6 bg-asphalt-dark p-4 border border-white/10">
                <p className="telemetry-text text-xs text-pit-gray">HARDWARE VALUE</p>
                <p className="racing-headline text-2xl text-telemetry-cyan">$20K+ PER RIG</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RC Track Section */}
      <SectionDivider />
      <section ref={rcRef} className="py-24 md:py-32 bg-asphalt-dark relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-10" />
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="rc-visual relative">
              <div className="relative aspect-[4/3] bg-asphalt overflow-hidden">
                <Image
                  src="/assets/FullRCTrackWide.webp"
                  alt="Indoor RC track at MC Racing Sim Fort Wayne"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-asphalt-dark via-transparent to-transparent opacity-60" />
                <div className="absolute inset-0 border border-telemetry-cyan/20" />
                <div className="absolute top-0 right-0 w-16 h-1 bg-telemetry-cyan" />
                <div className="absolute top-0 right-0 w-1 h-16 bg-telemetry-cyan" />
                <div className="absolute bottom-0 left-0 w-16 h-1 bg-apex-red" />
                <div className="absolute bottom-0 left-0 w-1 h-16 bg-apex-red" />
              </div>
              <div className="absolute -bottom-6 -left-6 bg-asphalt p-4 border border-white/10">
                <p className="telemetry-text text-xs text-pit-gray">TRACK TYPE</p>
                <p className="racing-headline text-2xl text-apex-red">INDOOR CARPET</p>
              </div>
            </div>
            <div className="rc-content">
              <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
                // The Track
              </span>
              <h2 className="racing-headline text-4xl md:text-5xl lg:text-6xl text-grid-white mb-6">
                <ScrambleText text="Technical" />
                <span className="text-telemetry-cyan"> Short-Course</span>
              </h2>
              <p className="telemetry-text text-pit-gray leading-relaxed mb-8">
                Technical short-course RC racing. Jumps, rhythm sections, and head-to-head
                battles on our indoor carpet track.
              </p>
              <ul className="space-y-4 mb-6">
                {[
                  'Indoor carpet track',
                  'Rent for dirt cheap or bring your own',
                  'Up to 1/10 scale',
                  'Jumps & rhythm sections',
                  'Head-to-head racing',
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 telemetry-text text-grid-white">
                    <span className="w-2 h-2 bg-telemetry-cyan transform rotate-45" />
                    {feature}
                  </li>
                ))}
              </ul>
              <div className="mb-8 p-4 bg-apex-red/10 border border-apex-red/30">
                <p className="telemetry-text text-sm text-grid-white">
                  <span className="text-apex-red font-bold">BOOK 2+ HOURS:</span> the <span className="text-telemetry-cyan font-bold">whole entertainment center is yours</span> — sims, RC track, and lounge included.
                </p>
              </div>
              <Button href="/pricing" variant="secondary">
                Hit The Track
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* CTA Section */}
      <section ref={ctaRef} className="relative py-32 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-asphalt">
          <Image
            src="/assets/OverShoulderWheelandGearGauge.webp"
            alt="Racing simulator cockpit view"
            fill
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-apex-red/20 via-transparent to-telemetry-cyan/20" />
          <div className="absolute inset-0 grid-bg opacity-30" />
        </div>

        <div className="cta-content relative z-10 max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
            // Ready to Race?
          </span>
          <h2 className="racing-headline text-4xl md:text-6xl text-grid-white mb-6">
            <ScrambleText text="3 Spots on" />
            <span className="text-apex-red"> The Grid</span>
          </h2>
          <p className="telemetry-text text-xl text-pit-gray mb-10 max-w-2xl mx-auto">
            We here at MC Racing prefer quality over quantity for our simulators.
            We currently have three, so make sure to book ahead!
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="/book" size="lg">
              Book Online
            </Button>
            <Button href="/pit-lane" variant="secondary" size="lg">
              Plan a Party
            </Button>
          </div>
          <p className="telemetry-text text-sm text-pit-gray mt-4">
            Or call to book:{' '}
            <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">(808) 220-2600</a>
          </p>

          {/* Urgency indicator */}
        </div>
      </section>
    </>
  )
}
