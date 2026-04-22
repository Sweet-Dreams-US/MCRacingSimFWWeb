'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Button from '@/components/Button'
import SectionDivider from '@/components/SectionDivider'

function CheckinContent() {
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('bookingId')
  const slot = searchParams.get('slot')
  const isLinkedBooking = !!(bookingId && slot)

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    birthday: '',
    phone: '',
    email: '',
    howDidYouHear: '',
    agreedToWaiver: false,
    marketingOptIn: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // Auto-reset to a new blank inspection 2 seconds after a successful walk-in check-in.
  // Linked bookings (SMS check-in for a specific racer slot) stay on the success screen
  // to prevent accidental duplicate waiver submissions for the same slot.
  useEffect(() => {
    if (submitStatus === 'success' && !isLinkedBooking) {
      const timer = setTimeout(() => {
        setSubmitStatus('idle')
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [submitStatus, isLinkedBooking])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      // Submit to Google Sheets via Apps Script
      const scriptUrl = process.env.NEXT_PUBLIC_CHECKIN_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbwbD9jbCxOl0gl_aUob_GuQ5IXK7-PujlfC_4JnqUrTBxazZWxeZf9EX0QxPY7j4Rkb/exec'

      const submitData: Record<string, string | boolean> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        birthday: formData.birthday,
        phone: formData.phone,
        email: formData.email,
        howDidYouHear: formData.howDidYouHear,
        signedWaiver: formData.agreedToWaiver ? 'Yes' : 'No',
        marketingOptIn: formData.marketingOptIn ? 'Yes' : 'No',
        timestamp: new Date().toISOString(),
      }

      // If this is a linked booking, include booking info
      if (isLinkedBooking) {
        submitData.bookingId = bookingId!
        submitData.racerSlot = slot!
      }

      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      })

      // If linked to a booking, also update the main booking sheet
      if (isLinkedBooking) {
        const bookingScriptUrl = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL
        if (bookingScriptUrl) {
          try {
            await fetch(bookingScriptUrl, {
              method: 'POST',
              mode: 'no-cors',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'updateRacerWaiver',
                bookingId,
                slot,
                waiverSigned: true,
              }),
            })
          } catch (err) {
            console.error('Failed to update booking waiver status:', err)
          }
        }
      }

      setSubmitStatus('success')
      setFormData({
        firstName: '',
        lastName: '',
        birthday: '',
        phone: '',
        email: '',
        howDidYouHear: '',
        agreedToWaiver: false,
        marketingOptIn: false,
      })
    } catch (error) {
      console.error('Submission error:', error)
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const howDidYouHearOptions = [
    'Google Search',
    'Facebook',
    'Instagram',
    'TikTok',
    'Friend/Family',
    'Drive By',
    'Event/Fair',
    'Other',
  ]

  return (
    <>
      {/* Hero Section */}
      <section className="relative pt-32 pb-12 bg-asphalt-dark overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="inline-block telemetry-text text-sm text-apex-red uppercase tracking-widest mb-4">
            // Tech Inspection
          </span>
          <h1 className="racing-headline text-5xl md:text-6xl text-grid-white mb-6">
            Pre-Race
            <span className="text-apex-red"> Clearance</span>
          </h1>
          <p className="telemetry-text text-lg text-pit-gray max-w-2xl mx-auto">
            {isLinkedBooking
              ? `Complete your check-in for booking ${bookingId}. Sign the waiver and you're ready to race!`
              : 'Complete this form before your session. All drivers must complete the tech inspection and sign the waiver before racing.'}
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Linked Booking Notice */}
      {isLinkedBooking && (
        <section className="py-4 bg-telemetry-cyan/10">
          <div className="max-w-2xl mx-auto px-6">
            <div className="flex items-center gap-3 justify-center">
              <div className="w-8 h-8 flex items-center justify-center bg-telemetry-cyan/20 text-telemetry-cyan racing-headline text-lg">
                {slot}
              </div>
              <p className="telemetry-text text-telemetry-cyan">
                Racer #{slot} check-in for booking <strong>{bookingId}</strong>
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Waiver Form Section */}
      <section className="py-16 bg-asphalt">
        <div className="max-w-2xl mx-auto px-6">
          {submitStatus === 'success' ? (
            isLinkedBooking ? (
              // Linked booking success — persistent screen (no auto-reset to avoid duplicate submissions)
              <div className="bg-telemetry-cyan/10 border border-telemetry-cyan p-8 text-center">
                <div className="text-5xl mb-4">✓</div>
                <h2 className="racing-headline text-2xl text-grid-white mb-4">
                  Tech Inspection <span className="text-telemetry-cyan">Complete!</span>
                </h2>
                <p className="telemetry-text text-pit-gray mb-6">
                  You&apos;re all set! Your waiver has been linked to the booking. See you at the track!
                </p>
                <div className="bg-asphalt-dark border border-white/10 p-4 mb-6">
                  <p className="telemetry-text text-sm text-pit-gray mb-2">Session Location</p>
                  <p className="telemetry-text text-grid-white">MC Racing Sim</p>
                  <p className="telemetry-text text-pit-gray">1205 W Main St, Fort Wayne, IN</p>
                  <p className="telemetry-text text-xs text-apex-red mt-2">Arrive 10 minutes early</p>
                </div>
              </div>
            ) : (
              // Walk-in kiosk success — simple "Thank You!" that auto-clears after 2 seconds
              <div className="bg-telemetry-cyan/10 border border-telemetry-cyan p-12 text-center">
                <div className="text-6xl mb-4">✓</div>
                <h2 className="racing-headline text-4xl md:text-5xl text-grid-white">
                  Thank <span className="text-telemetry-cyan">You!</span>
                </h2>
              </div>
            )
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Driver Information */}
              <div className="bg-asphalt-dark p-6 border border-white/10">
                <h2 className="racing-headline text-xl text-grid-white mb-6">
                  <span className="text-telemetry-cyan">01 // </span>
                  Driver Information
                </h2>

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
                      className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
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
                      className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="Racer"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    Birthday *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.birthday}
                    onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                    className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                  />
                  <p className="telemetry-text text-xs text-pit-gray mt-1">
                    Drivers must be 12+ years old and 42+ inches tall
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                      placeholder="racer@email.com"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                    How did you hear about us? *
                  </label>
                  <select
                    required
                    value={formData.howDidYouHear}
                    onChange={(e) => setFormData({ ...formData, howDidYouHear: e.target.value })}
                    className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
                  >
                    <option value="">Select an option</option>
                    {howDidYouHearOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-6">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.marketingOptIn}
                      onChange={(e) => setFormData({ ...formData, marketingOptIn: e.target.checked })}
                      className="w-5 h-5 accent-apex-red mt-0.5"
                    />
                    <span className="telemetry-text text-sm text-grid-white">
                      Yes, I'd like to receive promos, deals, and updates from MC Racing Sim Fort Wayne
                    </span>
                  </label>
                </div>
              </div>

              {/* Waiver Agreement */}
              <div className="bg-asphalt-dark p-6 border border-white/10">
                <h2 className="racing-headline text-xl text-grid-white mb-6">
                  <span className="text-telemetry-cyan">02 // </span>
                  Acknowledgment & Release
                </h2>

                <div className="h-48 overflow-y-auto bg-asphalt p-4 border border-white/10 mb-4">
                  <p className="telemetry-text text-xs text-pit-gray leading-relaxed">
                    WAIVER AND RELEASE OF LIABILITY
                    <br /><br />
                    In consideration of being allowed to participate in any way in the MC Racing Sim
                    program, related events and activities, I, the undersigned, acknowledge, appreciate,
                    and agree that:
                    <br /><br />
                    1. The risk of injury from the activities involved in this program is significant,
                    including the potential for permanent paralysis and death, and while particular
                    rules, equipment, and personal discipline may reduce this risk, the risk of serious
                    injury does exist.
                    <br /><br />
                    2. I KNOWINGLY AND FREELY ASSUME ALL SUCH RISKS, both known and unknown, EVEN IF
                    ARISING FROM THE NEGLIGENCE OF THE RELEASEES or others, and assume full
                    responsibility for my participation.
                    <br /><br />
                    3. I willingly agree to comply with the stated and customary terms and conditions
                    for participation. If, however, I observe any unusual significant hazard during my
                    presence or participation, I will remove myself from participation and bring such
                    to the attention of the nearest official immediately.
                    <br /><br />
                    4. I, for myself and on behalf of my heirs, assigns, personal representatives and
                    next of kin, HEREBY RELEASE AND HOLD HARMLESS MC Racing Sim Fort Wayne, their
                    officers, officials, agents, and/or employees, other participants, sponsoring
                    agencies, sponsors, advertisers, and if applicable, owners and lessors of premises
                    used to conduct the event ("RELEASEES"), WITH RESPECT TO ANY AND ALL INJURY,
                    DISABILITY, DEATH, or loss or damage to person or property, WHETHER ARISING FROM
                    THE NEGLIGENCE OF THE RELEASEES OR OTHERWISE, to the fullest extent permitted by law.
                    <br /><br />
                    5. I acknowledge that motion simulators may cause motion sickness, dizziness, or
                    discomfort in some individuals. I agree to immediately stop using the equipment if
                    I feel unwell.
                    <br /><br />
                    6. I agree to pay for any damage to equipment caused by my negligence or misuse.
                  </p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={formData.agreedToWaiver}
                    onChange={(e) => setFormData({ ...formData, agreedToWaiver: e.target.checked })}
                    className="w-5 h-5 accent-apex-red mt-0.5"
                  />
                  <span className="telemetry-text text-sm text-grid-white">
                    I have read this release of liability and assumption of risk agreement, fully
                    understand its terms, understand that I have given up substantial rights by
                    signing it, and sign it freely and voluntarily without any inducement. *
                  </span>
                </label>
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
                  {isSubmitting ? 'Submitting...' : 'Complete Tech Inspection'}
                </Button>
                <p className="telemetry-text text-xs text-pit-gray mt-4">
                  Your information is secure and will only be used for race day operations.
                </p>
              </div>
            </form>
          )}
        </div>
      </section>
    </>
  )
}

export default function WaiverPage() {
  return (
    <Suspense fallback={
      <section className="relative pt-32 pb-12 bg-asphalt-dark min-h-screen">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-telemetry-cyan border-t-transparent rounded-full mx-auto" />
        </div>
      </section>
    }>
      <CheckinContent />
    </Suspense>
  )
}
