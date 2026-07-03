'use client'

import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'

export default function MembershipsClient() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-12 bg-asphalt-dark overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
            // Commit to Speed
          </span>
          <h1 className="racing-headline text-5xl md:text-6xl text-grid-white mb-6">
            Monthly
            <span className="text-apex-red"> Memberships</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-2xl mx-auto mb-4">
            Weekday solo racing, weekend hours, and the ability to bring friends. The more you race,
            the more value you get. Pick the tier that matches your lifestyle.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-apex-red/10 border border-apex-red/30">
            <span className="telemetry-text text-sm text-apex-red">
              3-MONTH COMMITMENT REQUIRED
            </span>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Individual Memberships */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
              // Choose Your Tier
            </span>
            <h2 className="racing-headline text-4xl text-grid-white">
              Membership <span className="text-telemetry-cyan">Plans</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Solo */}
            <div className="bg-asphalt-dark border border-white/10 p-8 relative overflow-hidden hover:border-telemetry-cyan/50 transition-colors">
              <div className="absolute top-0 left-0 w-full h-1 bg-telemetry-cyan/50" />
              <div className="text-center mb-6">
                <h3 className="racing-headline text-2xl text-grid-white mb-2">Solo</h3>
                <div className="racing-headline text-5xl text-telemetry-cyan">$150</div>
                <div className="telemetry-text text-pit-gray text-sm">per month</div>
                <div className="telemetry-text text-telemetry-cyan text-sm mt-1">$450 / 3-month upfront</div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Solo Hours</span>
                  <span className="telemetry-text text-telemetry-cyan font-bold text-right">Tue-Fri, Noon-7pm</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Weekend Hours</span>
                  <span className="telemetry-text text-grid-white font-bold">Unlimited</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Bring Friends</span>
                  <span className="telemetry-text text-grid-white font-bold">1 friend, 2x/mo</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="telemetry-text text-pit-gray">Best For</span>
                  <span className="telemetry-text text-grid-white font-bold">Weekly racers</span>
                </div>
              </div>

              <p className="telemetry-text text-sm text-pit-gray mb-6 text-center">
                Break even at just 3-4 visits/month. Perfect entry point.
              </p>

              <div className="text-center">
                <Button href="tel:+18082202600" variant="secondary" fullWidth>
                  Get Started
                </Button>
              </div>
            </div>

            {/* Crew */}
            <div className="bg-asphalt-dark border-2 border-apex-red p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-apex-red" />
              <div className="absolute top-4 right-4">
                <span className="bg-apex-red text-white telemetry-text text-xs uppercase tracking-wider px-3 py-1">
                  Most Popular
                </span>
              </div>
              <div className="text-center mb-6">
                <h3 className="racing-headline text-2xl text-grid-white mb-2">Crew</h3>
                <div className="racing-headline text-5xl text-apex-red">$200</div>
                <div className="telemetry-text text-pit-gray text-sm">per month</div>
                <div className="telemetry-text text-apex-red text-sm mt-1">$600 / 3-month upfront</div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Solo Hours</span>
                  <span className="telemetry-text text-apex-red font-bold text-right">Tue-Fri, Noon-7pm</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Weekend Hours</span>
                  <span className="telemetry-text text-grid-white font-bold">Unlimited</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Bring Friends</span>
                  <span className="telemetry-text text-grid-white font-bold">2 friends, 3x/mo</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="telemetry-text text-pit-gray">Best For</span>
                  <span className="telemetry-text text-grid-white font-bold">Social racers</span>
                </div>
              </div>

              <p className="telemetry-text text-sm text-pit-gray mb-6 text-center">
                The sweet spot. Fill seats on slow nights with your crew.
              </p>

              <div className="text-center">
                <Button href="tel:+18082202600" fullWidth>
                  Go Crew
                </Button>
              </div>
            </div>

            {/* VIP */}
            <div className="bg-asphalt-dark border border-white/10 p-8 relative overflow-hidden hover:border-telemetry-cyan/50 transition-colors">
              <div className="absolute top-0 left-0 w-full h-1 bg-telemetry-cyan/50" />
              <div className="text-center mb-6">
                <h3 className="racing-headline text-2xl text-grid-white mb-2">VIP</h3>
                <div className="racing-headline text-5xl text-telemetry-cyan">$250</div>
                <div className="telemetry-text text-pit-gray text-sm">per month</div>
                <div className="telemetry-text text-telemetry-cyan text-sm mt-1">$750 / 3-month upfront</div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Solo Hours</span>
                  <span className="telemetry-text text-telemetry-cyan font-bold text-right">Tue-Fri, Noon-7pm</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Weekend Hours</span>
                  <span className="telemetry-text text-grid-white font-bold">Unlimited</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Bring Friends</span>
                  <span className="telemetry-text text-grid-white font-bold">2+ friends, 4x/mo</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="telemetry-text text-pit-gray">Best For</span>
                  <span className="telemetry-text text-grid-white font-bold">Serious racers</span>
                </div>
              </div>

              <p className="telemetry-text text-sm text-pit-gray mb-6 text-center">
                Premium tier with unlimited hours and the most friend visits.
              </p>

              <div className="text-center">
                <Button href="tel:+18082202600" variant="secondary" fullWidth>
                  Go VIP
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="gradient" />

      {/* Duo Membership */}
      <section className="py-16 bg-asphalt-dark">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Race Together
            </span>
            <h2 className="racing-headline text-4xl text-grid-white">
              Duo <span className="text-apex-red">Membership</span>
            </h2>
            <p className="telemetry-text text-pit-gray mt-4">
              Two people, unlimited racing, anytime. The ultimate shared membership.
            </p>
          </div>

          <div className="bg-asphalt border-2 border-apex-red/50 p-8 md:p-12 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-apex-red to-telemetry-cyan" />

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center md:text-left">
                <h3 className="racing-headline text-3xl text-grid-white mb-2">Duo</h3>
                <div className="racing-headline text-6xl text-apex-red">$300</div>
                <div className="telemetry-text text-pit-gray">per month</div>
                <p className="telemetry-text text-sm text-telemetry-cyan mt-2">
                  $150 per person &bull; $900 / 3-month upfront
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Members</span>
                  <span className="telemetry-text text-grid-white font-bold">2 People</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Hours</span>
                  <span className="telemetry-text text-apex-red font-bold">Unlimited</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Availability</span>
                  <span className="telemetry-text text-grid-white font-bold">Anytime</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="telemetry-text text-pit-gray">Best For</span>
                  <span className="telemetry-text text-grid-white font-bold">Couples, Parent/Kid, Best Friends</span>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Button href="tel:+18082202600" size="lg">
                Sign Up as Duo
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="checkered" />

      {/* How It Works */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
              // The Details
            </span>
            <h2 className="racing-headline text-4xl text-grid-white">
              How It <span className="text-telemetry-cyan">Works</span>
            </h2>
          </div>

          <div className="space-y-6">
            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">01 // </span>3-Month Commitment
              </h3>
              <p className="telemetry-text text-pit-gray">
                All memberships require a 3-month minimum commitment. Pay monthly or save by paying
                the full 3 months upfront. After the initial commitment, memberships continue month-to-month.
              </p>
            </div>

            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">02 // </span>Solo Hours &amp; Weekends
              </h3>
              <p className="telemetry-text text-pit-gray">
                Every membership includes unlimited hours. Solo, Crew, and VIP get weekday solo racing
                Tuesday through Friday, Noon to 7pm, plus unlimited weekend hours. Duo members get
                unlimited access anytime, for two.
              </p>
            </div>

            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">03 // </span>Bring Your Friends
              </h3>
              <p className="telemetry-text text-pit-gray">
                Each tier lets you bring friends to race with you. Solo gets 1 friend visit 2x per month,
                Crew gets 3 visits with up to 2 friends, and VIP gets 4 visits with 2+ friends.
              </p>
            </div>

            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">04 // </span>Daily Limits
              </h3>
              <p className="telemetry-text text-pit-gray">
                Members can race up to 2 hours per day. If other racers are waiting for a rig,
                the daily limit drops to 1 hour so everyone gets seat time.
              </p>
            </div>

            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">05 // </span>Reservations
              </h3>
              <p className="telemetry-text text-pit-gray">
                Member reservations can only be made up to 1 hour before arrival. No advance booking days
                ahead &mdash; this keeps rigs open for walk-ins and new rider appointments.
              </p>
            </div>

            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-3">
                <span className="text-telemetry-cyan">06 // </span>Duo Membership
              </h3>
              <p className="telemetry-text text-pit-gray">
                The Duo membership is for two named members who both get unlimited access, anytime.
                Perfect for couples, parent/child combos, or best friends who want to race together regularly.
                Both members must be registered at signup.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="gradient" />

      {/* Comparison Table */}
      <section className="py-16 bg-asphalt-dark">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Compare
            </span>
            <h2 className="racing-headline text-4xl text-grid-white">
              Membership <span className="text-apex-red">Comparison</span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left telemetry-text text-pit-gray uppercase tracking-wider py-4 px-4">Feature</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">Solo</th>
                  <th className="text-center telemetry-text text-apex-red uppercase tracking-wider py-4 px-4">Crew</th>
                  <th className="text-center telemetry-text text-telemetry-cyan uppercase tracking-wider py-4 px-4">VIP</th>
                  <th className="text-center telemetry-text text-apex-red uppercase tracking-wider py-4 px-4">Duo</th>
                </tr>
              </thead>
              <tbody className="telemetry-text">
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Monthly</td>
                  <td className="text-center text-grid-white py-4 px-4">$150/mo</td>
                  <td className="text-center text-grid-white py-4 px-4">$200/mo</td>
                  <td className="text-center text-grid-white py-4 px-4">$250/mo</td>
                  <td className="text-center text-grid-white py-4 px-4">$300/mo</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">3-Month Upfront</td>
                  <td className="text-center text-grid-white py-4 px-4">$450</td>
                  <td className="text-center text-grid-white py-4 px-4">$600</td>
                  <td className="text-center text-grid-white py-4 px-4">$750</td>
                  <td className="text-center text-grid-white py-4 px-4">$900</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Solo Hours</td>
                  <td className="text-center text-telemetry-cyan font-bold py-4 px-4">Tue-Fri<br/>Noon-7pm</td>
                  <td className="text-center text-apex-red font-bold py-4 px-4">Tue-Fri<br/>Noon-7pm</td>
                  <td className="text-center text-telemetry-cyan font-bold py-4 px-4">Tue-Fri<br/>Noon-7pm</td>
                  <td className="text-center text-apex-red font-bold py-4 px-4">Unlimited</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Weekend Hours</td>
                  <td className="text-center text-telemetry-cyan font-bold py-4 px-4">Unlimited</td>
                  <td className="text-center text-apex-red font-bold py-4 px-4">Unlimited</td>
                  <td className="text-center text-telemetry-cyan font-bold py-4 px-4">Unlimited</td>
                  <td className="text-center text-apex-red font-bold py-4 px-4">Anytime</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Members</td>
                  <td className="text-center text-grid-white py-4 px-4">1</td>
                  <td className="text-center text-grid-white py-4 px-4">1</td>
                  <td className="text-center text-grid-white py-4 px-4">1</td>
                  <td className="text-center text-grid-white py-4 px-4">2</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Friend Visits</td>
                  <td className="text-center text-grid-white py-4 px-4">1 friend, 2x/mo</td>
                  <td className="text-center text-grid-white py-4 px-4">2 friends, 3x/mo</td>
                  <td className="text-center text-grid-white py-4 px-4">2+ friends, 4x/mo</td>
                  <td className="text-center text-pit-gray py-4 px-4">&mdash;</td>
                </tr>
                <tr className="border-b border-white/10">
                  <td className="text-pit-gray py-4 px-4">Daily Limit</td>
                  <td className="text-center text-grid-white py-4 px-4" colSpan={4}>2hrs/day (1hr if others are waiting)</td>
                </tr>
                <tr>
                  <td className="text-pit-gray py-4 px-4">Reservations</td>
                  <td className="text-center text-grid-white py-4 px-4" colSpan={4}>Up to 1hr before arrival only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="racing-headline text-3xl text-grid-white mb-4">
            Ready to <span className="text-apex-red">Commit?</span>
          </h2>
          <p className="telemetry-text text-pit-gray mb-8">
            Call us or stop by to set up your membership. We'll get you on the grid.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button href="tel:+18082202600" size="lg">
              Call (808) 220-2600
            </Button>
            <Button href="/location" variant="secondary" size="lg">
              Visit Us
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
