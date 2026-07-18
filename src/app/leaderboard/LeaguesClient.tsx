'use client'

import { useState } from 'react'
import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'

export default function LeaguesClient() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    leagueType: '',
    experience: '',
    commitmentType: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      const LOCAL_LEAGUE_URL = 'https://script.google.com/a/macros/sweetdreamsmusic.com/s/AKfycbzEY-jFucAia8hInMYtL2dmrBrycq91nCXkGhEd9HhV0ZMwLXienfWhey-t4LfNiOvWoQ/exec'
      const ONLINE_LEAGUE_URL = 'https://script.google.com/a/macros/sweetdreamsmusic.com/s/AKfycbykQhVDiO8d3DXSVM5j0EA4_cCTataBv_l5K_rRbNgqFKfHzIcKupeSF2QxzWWG-wuw8g/exec'

      const payload = JSON.stringify({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        leagueType: formData.leagueType,
        experience: formData.experience,
        commitmentType: formData.commitmentType,
        notes: formData.notes,
        timestamp: new Date().toISOString(),
      })

      const fetchOptions = {
        method: 'POST',
        mode: 'no-cors' as RequestMode,
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload,
      }

      // Send to correct sheet(s) based on league selection
      if (formData.leagueType === 'Local League' || formData.leagueType === 'Both') {
        await fetch(LOCAL_LEAGUE_URL, fetchOptions)
      }
      if (formData.leagueType === 'Online League' || formData.leagueType === 'Both') {
        await fetch(ONLINE_LEAGUE_URL, fetchOptions)
      }

      setSubmitStatus('success')
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        leagueType: '',
        experience: '',
        commitmentType: '',
        notes: '',
      })
    } catch (error) {
      console.error('Submission error:', error)
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-12 bg-asphalt-dark overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
            // Competitive Racing
          </span>
          <h1 className="racing-headline text-5xl md:text-6xl text-grid-white mb-6">
            Racing
            <span className="text-apex-red"> Leagues</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-2xl mx-auto">
            12-week seasons. Championship stakes. Whether you race locally in our 3-racer heat format
            or compete online against drivers nationwide, this is where legends are made.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Pricing Overview */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Local League Card */}
            <div className="bg-asphalt-dark border border-apex-red/30 p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-apex-red" />
              <h2 className="racing-headline text-3xl text-grid-white mb-2">
                Local <span className="text-apex-red">League</span>
              </h2>
              <p className="telemetry-text text-pit-gray mb-6">3-Racer Heat Format</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Drop-in</span>
                  <span className="racing-headline text-2xl text-grid-white">$30<span className="text-sm text-pit-gray">/night</span></span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Season Pass</span>
                  <span className="racing-headline text-2xl text-apex-red">$240<span className="text-sm text-pit-gray">/season</span></span>
                </div>
                <p className="telemetry-text text-xs text-pit-gray">
                  Season pass = $20/night. Prize pool funded by house.
                </p>
              </div>
            </div>

            {/* Online League Card */}
            <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-telemetry-cyan" />
              <h2 className="racing-headline text-3xl text-grid-white mb-2">
                Online <span className="text-telemetry-cyan">League</span>
              </h2>
              <p className="telemetry-text text-pit-gray mb-6">Time Attack — Race Nationwide</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Drop-in</span>
                  <span className="racing-headline text-2xl text-grid-white">$30<span className="text-sm text-pit-gray">/night</span></span>
                </div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <span className="telemetry-text text-pit-gray">Season Pass</span>
                  <span className="racing-headline text-2xl text-telemetry-cyan">$240<span className="text-sm text-pit-gray">/season</span></span>
                </div>
                <p className="telemetry-text text-xs text-pit-gray">
                  Season pass = $20/night. Drop-in: $10 to prize pool. Season: $5/week to pool.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="gradient" />

      {/* Local League Rules */}
      <section className="py-16 bg-asphalt-dark">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Local Competition
            </span>
            <h2 className="racing-headline text-4xl text-grid-white mb-4">
              Local League <span className="text-apex-red">Rules</span>
            </h2>
            <p className="telemetry-text text-pit-gray">
              12 racers | 12-week season | 3-racer heat format
            </p>
          </div>

          <div className="space-y-8">
            {/* Commitment & Attendance */}
            <div className="bg-asphalt p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">01 // </span>Commitment & Attendance
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-apex-red">&#9632;</span>
                  Season pass holders commit to all 12 weeks. No refunds for missed nights.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">&#9632;</span>
                  Miss a race night = zero points. No makeup races, no exceptions.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">&#9632;</span>
                  Substitutes allowed — sub must not have a faster qualifying time than you from any previous league night. If sub qualifies faster than your season best, their points are void.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">&#9632;</span>
                  Sub must be approved by league coordinator before race night.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">&#9632;</span>
                  Drop-in racers can attend any night and compete for points on equal terms.
                </li>
              </ul>
            </div>

            {/* Format */}
            <div className="bg-asphalt p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">02 // </span>Race Format
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Time attack qualifying session sets the grid.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Racers placed into heats of 3 based on qualifying results.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Multiple rounds per night — groups shuffled each round so everyone races different opponents.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Points per heat: 1st = 3 pts | 2nd = 2 pts | 3rd = 1 pt
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  All heat points accumulate into season-long standings.
                </li>
              </ul>
            </div>

            {/* Season Structure */}
            <div className="bg-asphalt p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">03 // </span>Season Structure
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-asphalt-dark">
                  <div className="racing-headline text-2xl text-grid-white">Weeks 1–10</div>
                  <div className="telemetry-text text-pit-gray text-sm">Regular Season</div>
                </div>
                <div className="text-center p-4 bg-asphalt-dark">
                  <div className="racing-headline text-2xl text-apex-red">Week 11</div>
                  <div className="telemetry-text text-pit-gray text-sm">Wildcard Night</div>
                </div>
                <div className="text-center p-4 bg-asphalt-dark">
                  <div className="racing-headline text-2xl text-telemetry-cyan">Week 12</div>
                  <div className="telemetry-text text-pit-gray text-sm">Championship Finals</div>
                </div>
              </div>
            </div>

            {/* Finals Format */}
            <div className="bg-asphalt p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">04 // </span>Finals Format (Week 12)
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="racing-headline text-lg text-apex-red mb-3">Championship Bracket (Top 6)</h4>
                  <ul className="space-y-2 telemetry-text text-pit-gray text-sm">
                    <li>Semi A: Seeds #1, #4, #5</li>
                    <li>Semi B: Seeds #2, #3, #6</li>
                    <li>Winners + best 2nd → Grand Final (3 racers)</li>
                    <li>Remaining 3 race for 4th–6th place</li>
                  </ul>
                </div>
                <div>
                  <h4 className="racing-headline text-lg text-telemetry-cyan mb-3">Losers Bracket (Bottom 6)</h4>
                  <ul className="space-y-2 telemetry-text text-pit-gray text-sm">
                    <li>Same format as championship bracket</li>
                    <li>Everyone races on finals night</li>
                    <li>Regardless of standing</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Conduct */}
            <div className="bg-asphalt p-6 border border-apex-red/30">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-apex-red">05 // </span>Conduct
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  Intentional wrecking or unsportsmanlike driving = zero points for that heat.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  Two incidents in one night = done for the evening with zero points.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  League coordinator has final say on all disputes.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  Removal for conduct = no refund issued.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="gradient" />

      {/* Online League Rules */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-telemetry-cyan uppercase tracking-widest mb-4">
              // Nationwide Competition
            </span>
            <h2 className="racing-headline text-4xl text-grid-white mb-4">
              Online League <span className="text-telemetry-cyan">Rules</span>
            </h2>
            <p className="telemetry-text text-pit-gray">
              12 racers | 12-week season | Time attack live against racers nationwide
            </p>
          </div>

          <div className="space-y-8">
            {/* Commitment & Attendance */}
            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">01 // </span>Commitment & Attendance
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Season pass holders commit to all 12 weeks. No refunds for missed nights.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Miss a race night = zero points. No makeup sessions.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  No substitutes for online league. Your times are your times.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Drop-in racers can attend any night and compete for points on equal terms.
                </li>
              </ul>
            </div>

            {/* Format */}
            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">02 // </span>Race Format
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Specific track and car combination announced each week in advance.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Time attack format — fastest lap within the session window wins.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Race live alongside drivers at sim centers across the country.
                </li>
                <li className="flex gap-3">
                  <span className="text-telemetry-cyan">&#9632;</span>
                  Standings based on lap times, not wheel-to-wheel contact.
                </li>
              </ul>
              <div className="mt-4 p-4 bg-asphalt border border-telemetry-cyan/20">
                <h4 className="telemetry-text text-sm text-telemetry-cyan uppercase tracking-wider mb-2">Points Per Week</h4>
                <p className="telemetry-text text-pit-gray text-sm">
                  1st = 12 | 2nd = 10 | 3rd = 8 | 4th = 6 | 5th = 5 | 6th = 4 | 7th = 3 | 8th = 2 | 9th–12th = 1
                </p>
              </div>
            </div>

            {/* Season Structure */}
            <div className="bg-asphalt-dark p-6 border border-white/10">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">03 // </span>Season Structure
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-asphalt">
                  <div className="racing-headline text-2xl text-grid-white">Weeks 1–10</div>
                  <div className="telemetry-text text-pit-gray text-sm">Regular Season</div>
                </div>
                <div className="text-center p-4 bg-asphalt">
                  <div className="racing-headline text-2xl text-apex-red">Week 11</div>
                  <div className="telemetry-text text-pit-gray text-sm">Wildcard Week</div>
                </div>
                <div className="text-center p-4 bg-asphalt">
                  <div className="racing-headline text-2xl text-telemetry-cyan">Week 12</div>
                  <div className="telemetry-text text-pit-gray text-sm">Finals (Double Points)</div>
                </div>
              </div>
            </div>

            {/* Prize Pool */}
            <div className="bg-asphalt-dark p-6 border border-telemetry-cyan/30">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-telemetry-cyan">04 // </span>Prize Pool Distribution
              </h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-asphalt">
                  <div className="racing-headline text-3xl text-apex-red">50%</div>
                  <div className="telemetry-text text-pit-gray text-sm">1st Place</div>
                </div>
                <div className="p-4 bg-asphalt">
                  <div className="racing-headline text-3xl text-grid-white">30%</div>
                  <div className="telemetry-text text-pit-gray text-sm">2nd Place</div>
                </div>
                <div className="p-4 bg-asphalt">
                  <div className="racing-headline text-3xl text-telemetry-cyan">20%</div>
                  <div className="telemetry-text text-pit-gray text-sm">3rd Place</div>
                </div>
              </div>
              <p className="telemetry-text text-xs text-pit-gray mt-4 text-center">
                Prize pool pays out at end of season based on final standings.
              </p>
            </div>

            {/* Conduct */}
            <div className="bg-asphalt-dark p-6 border border-apex-red/30">
              <h3 className="racing-headline text-xl text-grid-white mb-4">
                <span className="text-apex-red">05 // </span>Conduct
              </h3>
              <ul className="space-y-3 telemetry-text text-pit-gray">
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  Any attempt to manipulate times, use unauthorized assists, or cheat = immediate disqualification from season, no refund.
                </li>
                <li className="flex gap-3">
                  <span className="text-apex-red">!</span>
                  League coordinator has final say on all disputes.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider variant="checkered" />

      {/* Signup Form */}
      <section id="signup" className="py-16 bg-asphalt-dark">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
              // Join the Grid
            </span>
            <h2 className="racing-headline text-4xl text-grid-white mb-4">
              League <span className="text-apex-red">Signup</span>
            </h2>
            <p className="telemetry-text text-pit-gray">
              Add your name to the list. We'll contact you when the next season is forming.
            </p>
          </div>

          {submitStatus === 'success' ? (
            <div className="bg-telemetry-cyan/10 border border-telemetry-cyan p-8 text-center">
              <div className="text-5xl mb-4">&#127937;</div>
              <h2 className="racing-headline text-2xl text-grid-white mb-4">
                You're on the <span className="text-telemetry-cyan">List!</span>
              </h2>
              <p className="telemetry-text text-pit-gray mb-6">
                We'll be in touch when the next season starts forming. Get ready to race.
              </p>
              <Button onClick={() => setSubmitStatus('idle')}>
                Submit Another Entry
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Contact Information */}
              <div className="bg-asphalt p-6 border border-white/10">
                <h3 className="racing-headline text-xl text-grid-white mb-6">
                  <span className="text-telemetry-cyan">01 // </span>
                  Driver Information
                </h3>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="Racer"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="racer@email.com"
                    />
                  </div>
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      Phone *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                </div>
              </div>

              {/* League Selection */}
              <div className="bg-asphalt p-6 border border-white/10">
                <h3 className="racing-headline text-xl text-grid-white mb-6">
                  <span className="text-telemetry-cyan">02 // </span>
                  League Selection
                </h3>

                <div>
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    Which League? *
                  </label>
                  <select
                    required
                    value={formData.leagueType}
                    onChange={(e) => setFormData({ ...formData, leagueType: e.target.value })}
                    className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                  >
                    <option value="">Select a league</option>
                    <option value="Local League">Local League (3-Racer Heats)</option>
                    <option value="Online League">Online League (Time Attack Nationwide)</option>
                    <option value="Both">Both Leagues</option>
                  </select>
                </div>

                <div className="mt-4">
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    Commitment Type *
                  </label>
                  <select
                    required
                    value={formData.commitmentType}
                    onChange={(e) => setFormData({ ...formData, commitmentType: e.target.value })}
                    className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                  >
                    <option value="">Select commitment level</option>
                    <option value="Season Pass">Season Pass ($240 - Full Season)</option>
                    <option value="Drop-in">Drop-in ($30/night)</option>
                    <option value="Undecided">Undecided - Just Interested</option>
                  </select>
                </div>

                <div className="mt-4">
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    Racing Experience *
                  </label>
                  <select
                    required
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                  >
                    <option value="">Select experience level</option>
                    <option value="Beginner">Beginner - New to Sim Racing</option>
                    <option value="Intermediate">Intermediate - Some Experience</option>
                    <option value="Advanced">Advanced - Regular Sim Racer</option>
                    <option value="Expert">Expert - Competitive/League Experience</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div className="bg-asphalt p-6 border border-white/10">
                <h3 className="racing-headline text-xl text-grid-white mb-6">
                  <span className="text-telemetry-cyan">03 // </span>
                  Additional Info
                </h3>

                <div>
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    Questions or Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={4}
                    className="w-full bg-asphalt-dark border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors resize-none"
                    placeholder="Preferred race nights, questions about the league, etc."
                  />
                </div>
              </div>

              {submitStatus === 'error' && (
                <div className="bg-apex-red/10 border border-apex-red p-4 text-center">
                  <p className="telemetry-text text-sm text-apex-red">
                    There was an error submitting the form. Please try again or call us at{' '}
                    <a href="tel:+18082202600" className="underline">1(808) 220-2600</a>
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <div className="text-center">
                <Button type="submit" size="lg" fullWidth disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Join the Waitlist'}
                </Button>
                <p className="telemetry-text text-xs text-pit-gray mt-4">
                  We'll contact you when the next season is ready to launch.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}
