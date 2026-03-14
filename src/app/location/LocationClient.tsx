'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Image from 'next/image'
import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'
import ScrambleText from '@/components/ScrambleText'

gsap.registerPlugin(ScrollTrigger)

const features = [
  {
    icon: '🏭',
    title: '4,000+ Sq Ft',
    description: 'Expansive industrial warehouse space',
  },
  {
    icon: '📐',
    title: '14-Foot Ceilings',
    description: 'Vintage 1940s industrial architecture',
  },
  {
    icon: '🅿️',
    title: 'Free Parking',
    description: 'Ample on-site parking available',
  },
  {
    icon: '♿',
    title: 'Accessible',
    description: 'ADA compliant facility',
  },
]

const galleryImages = [
  { src: '/assets/WideTwoRacingBays.webp', label: 'Racing Bays' },
  { src: '/assets/Viewof2RacingBays.webp', label: 'Simulator View' },
  { src: '/assets/SimRacer.webp', label: 'Sim Racer' },
  { src: '/assets/RedLitEmptySimStation.webp', label: 'Sim Station' },
  { src: '/assets/RacerusingSimZoomedOut.webp', label: 'Racing Action' },
  { src: '/assets/OverShoulderWheelandGearGauge.webp', label: 'Cockpit View' },
  { src: '/assets/MCRacingSignBest.webp', label: 'MC Racing Sign' },
  { src: '/assets/MCRacingSignLeft.webp', label: 'Facility Sign' },
  { src: '/assets/MCRacingLogoOnMasterDesk.webp', label: 'Control Desk' },
  { src: '/assets/MarkFocusedRacing.webp', label: 'Focused Racing' },
  { src: '/assets/KidRacing.webp', label: 'Kid Racing' },
  { src: '/assets/GroupParty.webp', label: 'Group Event' },
  { src: '/assets/FullRCTrackWide.webp', label: 'RC Track' },
  { src: '/assets/FocusedYoungAdultRacing.webp', label: 'Young Adult Racing' },
  { src: '/assets/FocusedOverShoulderRacer.webp', label: 'Over Shoulder View' },
  { src: '/assets/FocusedKidRacing.webp', label: 'Kid Focused' },
  { src: '/assets/FocusedDadRacing.webp', label: 'Dad Racing' },
  { src: '/assets/DadOverShoulderRacingIndy500.webp', label: 'Indy 500 Action' },
  { src: '/assets/CloseUpYokewithRacer.webp', label: 'Yoke Close Up' },
  { src: '/assets/CloseUpSteeringWheelRacerHands.webp', label: 'Steering Wheel' },
  { src: '/assets/CloseUpRacerYoke.webp', label: 'Racer Yoke' },
  { src: '/assets/CloseUpOnGearGauge.webp', label: 'Gear Gauge' },
  { src: '/assets/BigRCCarsLinedUp.webp', label: 'RC Cars Lined Up' },
  { src: '/assets/BackofAlpineRacingChair.webp', label: 'Racing Chair' },
  { src: '/assets/SideAngleBigRCCars.webp', label: 'RC Cars Side View' },
  { src: '/assets/RCCarsSmallLinedUp.webp', label: 'Small RC Cars' },
]

export default function LocationClient() {
  const heroRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero animations
      gsap.fromTo('.location-hero-content > *',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          stagger: 0.15,
          ease: 'power3.out',
        }
      )

      // Features grid - use fromTo for reliability
      gsap.fromTo('.feature-item',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.features-grid',
            start: 'top 85%',
            once: true,
          },
        }
      )

      // Gallery items
      gsap.fromTo('.gallery-item',
        { scale: 0.9, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: galleryRef.current,
            start: 'top 85%',
            once: true,
          },
        }
      )

      // Directions cards
      gsap.fromTo('.direction-card',
        { x: 40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.directions-section',
            start: 'top 85%',
            once: true,
          },
        }
      )

      // Hours cards
      gsap.fromTo('.hours-card',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.hours-section',
            start: 'top 85%',
            once: true,
          },
        }
      )
    })

    return () => ctx.revert()
  }, [])

  return (
    <>
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative pt-32 pb-20 bg-asphalt-dark overflow-hidden"
      >
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-telemetry-cyan/50 to-transparent" />

        {/* Background image */}
        <div className="absolute inset-0 opacity-75">
          <Image
            src="/assets/FocusedKidRacing.webp"
            alt="Kid racing at MC Racing Sim"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-asphalt-dark via-asphalt-dark/80 to-asphalt-dark" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 location-hero-content">
          <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
            // The Paddock
          </span>
          <h1 className="racing-headline text-5xl md:text-6xl lg:text-7xl text-grid-white mb-6">
            <ScrambleText text="Locate The" />
            <span className="text-telemetry-cyan"> Paddock</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-3xl mb-8">
            Housed in a historic industrial warehouse in the heart of Fort Wayne,
            MC Racing Sim is an underground car culture haven. High ceilings, raw
            concrete, and the smell of ozone.
          </p>

          {/* Address */}
          <div className="inline-flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-8 p-6 bg-asphalt border border-white/10">
            <div>
              <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
                Address
              </p>
              <p className="racing-headline text-xl text-grid-white">
                1205 W Main St
              </p>
              <p className="telemetry-text text-pit-gray">
                Fort Wayne, IN 46808
              </p>
            </div>
            <div className="w-px h-12 bg-white/20 hidden sm:block" />
            <div>
              <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
                Neighborhood
              </p>
              <p className="racing-headline text-xl text-grid-white">
                West Main Street
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Features Section */}
      <section className="py-20 bg-asphalt">
        <div className="max-w-6xl mx-auto px-6">
          <div className="features-grid grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="feature-item bg-asphalt-dark p-6 border border-white/5 hover:border-telemetry-cyan/30 transition-all text-center"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="racing-headline text-lg text-grid-white mb-2">
                  {feature.title}
                </h3>
                <p className="telemetry-text text-sm text-pit-gray">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Gallery Section */}
      <section ref={galleryRef} className="py-20 bg-asphalt-dark">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // The Facility
            </span>
            <h2 className="racing-headline text-4xl md:text-5xl text-grid-white mb-4">
              <ScrambleText text="Inside The" />
              <span className="text-apex-red"> Factory of Speed</span>
            </h2>
          </div>

          {/* Gallery Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {galleryImages.map((item, i) => (
              <div
                key={i}
                className="gallery-item relative aspect-square bg-asphalt border border-white/10 overflow-hidden group"
              >
                <Image
                  src={item.src}
                  alt={item.label}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-asphalt via-transparent to-transparent opacity-60" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="telemetry-text text-xs text-grid-white uppercase tracking-wider">
                    {item.label}
                  </p>
                </div>
                {/* Corner accents on hover */}
                <div className="absolute top-0 left-0 w-4 h-1 bg-apex-red/0 group-hover:bg-apex-red transition-colors" />
                <div className="absolute top-0 left-0 w-1 h-4 bg-apex-red/0 group-hover:bg-apex-red transition-colors" />
                <div className="absolute bottom-0 right-0 w-4 h-1 bg-telemetry-cyan/0 group-hover:bg-telemetry-cyan transition-colors" />
                <div className="absolute bottom-0 right-0 w-1 h-4 bg-telemetry-cyan/0 group-hover:bg-telemetry-cyan transition-colors" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Map Section */}
      <section className="directions-section py-20 bg-asphalt overflow-hidden">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Map Placeholder */}
            <div className="relative aspect-square lg:aspect-auto lg:h-[500px] bg-asphalt-dark border border-white/10 overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=800&q=80"
                alt="Fort Wayne aerial view"
                fill
                className="object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center bg-asphalt/90 p-8 border border-white/10">
                  <div className="w-20 h-20 mx-auto mb-4 bg-apex-red/20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-apex-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <p className="racing-headline text-lg text-grid-white mb-2">1205 W Main St</p>
                  <p className="telemetry-text text-sm text-pit-gray mb-4">Fort Wayne, IN 46808</p>
                  <Button
                    href="https://www.google.com/maps/search/?api=1&query=1205+W+Main+St+Fort+Wayne+IN+46808"
                    variant="secondary"
                    size="sm"
                  >
                    Open in Google Maps
                  </Button>
                </div>
              </div>
              {/* Grid overlay */}
              <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
            </div>

            {/* Directions */}
            <div>
              <h3 className="racing-headline text-3xl text-grid-white mb-6">
                <span className="text-telemetry-cyan">// </span>
                <ScrambleText text="Getting Here" />
              </h3>

              <div className="space-y-6">
                <div className="direction-card p-4 bg-asphalt-dark border border-white/10">
                  <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
                    From Downtown Fort Wayne
                  </p>
                  <p className="telemetry-text text-pit-gray text-sm">
                    Head west on W Main St. We're located on the south side of the street,
                    just past the intersection with Wells St. Look for the industrial
                    warehouse with the red "MC" sign.
                  </p>
                </div>

                <div className="direction-card p-4 bg-asphalt-dark border border-white/10">
                  <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-2">
                    From I-69
                  </p>
                  <p className="telemetry-text text-pit-gray text-sm">
                    Take exit 102A for US-24 W/Jefferson Blvd. Continue on Jefferson,
                    then turn left onto W Main St. Continue for approximately 1 mile.
                  </p>
                </div>

                <div className="direction-card p-4 bg-asphalt-dark border border-white/10">
                  <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">
                    Parking
                  </p>
                  <p className="telemetry-text text-pit-gray text-sm">
                    Free parking is available in our lot adjacent to the building.
                    Additional street parking available on W Main St.
                  </p>
                </div>
              </div>

              {/* Contact Quick Links */}
              <div className="mt-8 flex flex-wrap gap-4">
                <Button href="tel:+18082202600" variant="secondary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  Call Us
                </Button>
                <Button href="mailto:mcsimracingfw@gmail.com" variant="ghost">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Email Us
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Hours Section */}
      <section className="hours-section py-20 bg-asphalt-dark">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="racing-headline text-3xl md:text-4xl text-grid-white mb-4">
              <ScrambleText text="Track" />
              <span className="text-apex-red"> Hours</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="hours-card bg-asphalt p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                Regular Hours
              </h3>
              <div className="space-y-3 telemetry-text">
                <div className="flex justify-between">
                  <span className="text-pit-gray">Monday</span>
                  <span className="text-telemetry-cyan">Reservations Only</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pit-gray">Tuesday - Thursday</span>
                  <span className="text-grid-white">Noon - Midnight</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pit-gray">Friday - Saturday</span>
                  <span className="text-grid-white">Noon - 2:00 AM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-pit-gray">Sunday</span>
                  <span className="text-grid-white">Noon - Midnight</span>
                </div>
              </div>
              <p className="telemetry-text text-xs text-telemetry-cyan mt-4">
                Always open anytime for reservations
              </p>
            </div>

            <div className="hours-card bg-apex-red/10 p-6 border border-apex-red/30">
              <h3 className="racing-headline text-xl text-apex-red mb-4">
                Private Events
              </h3>
              <p className="telemetry-text text-pit-gray mb-4">
                Available by appointment. Contact us for availability outside regular hours.
              </p>
              <ul className="space-y-2 telemetry-text text-sm">
                <li className="flex items-center gap-2 text-grid-white">
                  <span className="w-1.5 h-1.5 bg-apex-red rounded-full" />
                  Birthday parties
                </li>
                <li className="flex items-center gap-2 text-grid-white">
                  <span className="w-1.5 h-1.5 bg-apex-red rounded-full" />
                  Corporate events
                </li>
                <li className="flex items-center gap-2 text-grid-white">
                  <span className="w-1.5 h-1.5 bg-apex-red rounded-full" />
                  League nights
                </li>
                <li className="flex items-center gap-2 text-grid-white">
                  <span className="w-1.5 h-1.5 bg-apex-red rounded-full" />
                  Private championships
                </li>
              </ul>
            </div>
          </div>

          {/* Final CTA */}
          <div className="mt-12 text-center">
            <Button href="/pricing#booking" size="lg">
              Book Your Session Now
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
