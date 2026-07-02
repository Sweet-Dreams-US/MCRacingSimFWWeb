'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'
import RacerCountSelector from './RacerCountSelector'
import DurationSelector from './DurationSelector'
import BookingCalendar from './BookingCalendar'
import TimeSlotPicker from './TimeSlotPicker'
import CustomerInfoForm from './CustomerInfoForm'
import AdditionalRacerForm from './AdditionalRacerForm'
import WaiverSection from './WaiverSection'
import PriceSummary from './PriceSummary'
import CardSetupForm from './CardSetupForm'
import { calculatePrice, calculateNoShowFeeCents, formatDateLong } from '@/lib/pricing'

// Stripe.js is heavy; load lazily on demand. Returns a Promise<Stripe | null>.
// We resolve it once at module scope so we don't redownload Stripe.js on
// every re-render.
let stripePromise: Promise<StripeJs | null> | null = null
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!publishableKey) {
      // Unconfigured: return null so the UI can render an error.
      stripePromise = Promise.resolve(null)
    } else {
      stripePromise = loadStripe(publishableKey)
    }
  }
  return stripePromise
}

// Format cents as dollars, dropping ".00" for whole-dollar amounts so a $45
// session still reads "$45" but a discounted one reads "$22.50".
function formatDollarsCompact(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2)
}

interface CardSetupSession {
  bookingId: string
  setupIntentClientSecret: string
  sessionPriceCents: number
  noShowFeeCents: number
}

interface CustomerInfo {
  firstName: string
  lastName: string
  phone: string
  email: string
  birthday: string
  howHeard: string
}

interface AdditionalRacer {
  name: string
  phone: string
  email: string
}

export default function BookingFlow() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  // Set after the booking is created — triggers the Stripe Elements card step
  const [cardSetup, setCardSetup] = useState<CardSetupSession | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const cardSetupRef = useRef<HTMLDivElement>(null)

  // Booking state
  const [racerCount, setRacerCount] = useState<1 | 2 | 3>(1)
  const [duration, setDuration] = useState<1 | 2 | 3>(1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    birthday: '',
    howHeard: '',
  })
  const [additionalRacers, setAdditionalRacers] = useState<AdditionalRacer[]>([
    { name: '', phone: '', email: '' },
    { name: '', phone: '', email: '' },
  ])
  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [noShowConsentAccepted, setNoShowConsentAccepted] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  // Discount code (entered on the review step, validated server-side before it
  // sticks). `appliedDiscount` holds the accepted code + the cents it takes off.
  const [discountInput, setDiscountInput] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountCents: number } | null>(null)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [discountChecking, setDiscountChecking] = useState(false)

  // Warn before leaving mid-booking (native "Leave site?" prompt) once the
  // customer has started but before the booking is submitted — so an accidental
  // tab close or back-nav doesn't silently drop a half-filled reservation.
  useEffect(() => {
    const hasProgress =
      selectedDate !== null ||
      customerInfo.firstName.trim() !== '' ||
      customerInfo.email.trim() !== ''
    const alreadySubmitted = cardSetup !== null
    if (!hasProgress || alreadySubmitted) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // Chrome requires returnValue to be set.
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [selectedDate, customerInfo.firstName, customerInfo.email, cardSetup])

  // Validation errors
  const [customerErrors, setCustomerErrors] = useState<Partial<Record<keyof CustomerInfo, string>>>({})
  const [racerErrors, setRacerErrors] = useState<{ [key: number]: Partial<Record<keyof AdditionalRacer, string>> }>({})
  const [waiverError, setWaiverError] = useState<string | undefined>()
  const [noShowConsentError, setNoShowConsentError] = useState<string | undefined>()

  const validateCustomerInfo = (): boolean => {
    const errors: Partial<Record<keyof CustomerInfo, string>> = {}

    if (!customerInfo.firstName.trim()) errors.firstName = 'Required'
    if (!customerInfo.lastName.trim()) errors.lastName = 'Required'
    if (!customerInfo.phone.trim()) errors.phone = 'Required'
    if (!customerInfo.email.trim()) {
      errors.email = 'Required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerInfo.email)) {
      errors.email = 'Invalid email'
    }
    if (!customerInfo.birthday) errors.birthday = 'Required'
    if (!customerInfo.howHeard) errors.howHeard = 'Required'

    setCustomerErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateAdditionalRacers = (): boolean => {
    if (racerCount === 1) return true

    const errors: { [key: number]: Partial<Record<keyof AdditionalRacer, string>> } = {}
    const racersToValidate = racerCount - 1

    for (let i = 0; i < racersToValidate; i++) {
      const racer = additionalRacers[i]
      const racerError: Partial<Record<keyof AdditionalRacer, string>> = {}

      // Name still required — we need to know who's coming.
      if (!racer.name.trim()) racerError.name = 'Required'
      // Phone is optional now (collected for records, not messaging).
      // Email is optional — only used to send the friend FYI if provided.
      if (racer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(racer.email)) {
        racerError.email = 'Invalid email'
      }

      if (Object.keys(racerError).length > 0) {
        errors[i] = racerError
      }
    }

    setRacerErrors(errors)
    return Object.keys(errors).length === 0
  }

  const validateWaiver = (): boolean => {
    let valid = true
    if (!waiverAccepted) {
      setWaiverError('You must accept the waiver to continue')
      valid = false
    } else {
      setWaiverError(undefined)
    }
    if (!noShowConsentAccepted) {
      setNoShowConsentError(
        'You must authorize the no-show fee to complete your booking'
      )
      valid = false
    } else {
      setNoShowConsentError(undefined)
    }
    return valid
  }

  const handleReviewBooking = () => {
    setError(null)

    if (!selectedDate || !selectedTime) {
      setError('Please select both a date and time')
      return
    }

    // Defense-in-depth 90-minute cutoff check at submit time. The TimeSlotPicker
    // already grays out within-cutoff slots, but a user could pick a slot, fill
    // out the form for an hour, and then try to submit — by which point their
    // selection might have slipped under the cutoff window.
    if (isSelectedSlotWithinCutoff()) {
      setError(
        'Sorry — that time is now less than 90 minutes away. ' +
          'Online booking closes 90 min before session start. ' +
          'Call (808) 220-2600 for a last-minute reservation, or pick a later time.'
      )
      return
    }

    const customerValid = validateCustomerInfo()
    const racersValid = validateAdditionalRacers()
    const waiverValid = validateWaiver()

    if (customerValid && racersValid && waiverValid) {
      setShowConfirmation(true)
      setTimeout(() => {
        confirmRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  // ---------------------------------------------------------------------
  // 90-minute cutoff helper — duplicated wall-clock logic from TimeSlotPicker.
  // Keeping the check at the orchestrator level prevents an edge-case where
  // the picker rendered the slot as available but enough wall-clock time has
  // since passed that submission would now violate the cutoff.
  // ---------------------------------------------------------------------
  const isSelectedSlotWithinCutoff = (): boolean => {
    if (!selectedDate || !selectedTime) return false
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = (type: string) =>
      parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10)
    let easternHour = get('hour')
    if (easternHour === 24) easternHour = 0
    const easternMinutes = easternHour * 60 + get('minute')

    const [slotYear, slotMonth, slotDay] = selectedDate.split('-').map(Number)
    const slotEpoch = Date.UTC(slotYear, slotMonth - 1, slotDay, 0, 0)
    const easternEpoch = Date.UTC(get('year'), get('month') - 1, get('day'), 0, 0)
    if (slotEpoch > easternEpoch) return false
    if (slotEpoch < easternEpoch) return true

    const [t, period] = selectedTime.split(' ')
    const [hStr, mStr] = t.split(':')
    let h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    const slotMinutes = h * 60 + m
    return slotMinutes - easternMinutes < 90
  }

  // Validate + price a discount code against the current session. The server
  // is the source of truth; this just previews the savings before submit. The
  // same code is re-checked in /api/booking/create, so a stale price here can
  // never let a bad discount through.
  const applyDiscount = async () => {
    const code = discountInput.trim()
    if (!code || !selectedDate) return
    setDiscountChecking(true)
    setDiscountError(null)
    try {
      const { price } = calculatePrice(selectedDate, duration, racerCount)
      const res = await fetch('/api/booking/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, priceCents: price * 100, hours: duration }),
      })
      const data = await res.json()
      if (!data.ok) {
        setAppliedDiscount(null)
        setDiscountError(data.reason || "That code isn't valid.")
      } else {
        setAppliedDiscount({ code: data.code || code.toUpperCase(), discountCents: data.discountCents })
        setDiscountError(null)
      }
    } catch {
      setDiscountError('Could not check that code. Try again.')
    } finally {
      setDiscountChecking(false)
    }
  }

  const removeDiscount = () => {
    setAppliedDiscount(null)
    setDiscountInput('')
    setDiscountError(null)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    try {
      // Convert 12-hour time to 24-hour for Google Script
      const [time, period] = selectedTime!.split(' ')
      const [hours, minutes] = time.split(':').map(Number)
      let hour24 = hours
      if (period === 'PM' && hours !== 12) hour24 += 12
      if (period === 'AM' && hours === 12) hour24 = 0
      const startTime24 = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

      const { price } = calculatePrice(selectedDate!, duration, racerCount)
      const noShowFeeCents = calculateNoShowFeeCents(racerCount)

      // The exact text the customer agreed to. Stored on the booking row for
      // chargeback defense — if they dispute the no-show charge, we can prove
      // they consented to this specific amount at this specific time.
      const consentText =
        `I authorize MC Racing Sim Fort Wayne to charge the card I provide a ` +
        `no-show fee of $${(noShowFeeCents / 100).toFixed(0)} ` +
        `($20 per seat booked, ${racerCount} seat${racerCount > 1 ? 's' : ''}) ` +
        `if I fail to show up for my session. ` +
        `My card is not charged at booking — only if I no-show. ` +
        `Cancellations made at least 24 hours before the session are free.`

      // Format data to match Google Apps Script expectations (legacy — Phase 4
      // moves this off Apps Script onto the Supabase + Stripe pipeline).
      const bookingData = {
        type: 'booking',
        sessionDate: selectedDate,
        startTime: startTime24,
        duration: String(duration),
        numberOfRacers: racerCount,
        price: String(price),
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        birthday: customerInfo.birthday,
        phone: customerInfo.phone,
        email: customerInfo.email,
        howDidYouHear: customerInfo.howHeard,
        signedWaiver: true,
        marketingOptIn,
        // No-show consent snapshot (used by Phase 3 Stripe integration)
        noShowFeeCents,
        consentText,
        consentTimestamp: new Date().toISOString(),
        // Discount code the customer applied on the review step (may be null).
        discountCode: appliedDiscount?.code ?? null,
        // Additional racers — phone/email are now optional
        racer2: racerCount >= 2 ? {
          firstName: additionalRacers[0].name.split(' ')[0] || '',
          lastName: additionalRacers[0].name.split(' ').slice(1).join(' ') || '',
          phone: additionalRacers[0].phone,
          email: additionalRacers[0].email,
        } : null,
        racer3: racerCount >= 3 ? {
          firstName: additionalRacers[1].name.split(' ')[0] || '',
          lastName: additionalRacers[1].name.split(' ').slice(1).join(' ') || '',
          phone: additionalRacers[1].phone,
          email: additionalRacers[1].email,
        } : null,
      }

      // POST to our API → creates Supabase customer + booking + Stripe
      // SetupIntent. Returns the client_secret so the card step can collect.
      const response = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Booking failed')
      }

      // Step into the card-collection UI. The booking row is already created
      // in Supabase with status='confirmed'; the SetupIntent is created and
      // the only thing missing is the actual card attachment, which happens
      // browser → Stripe via Elements (we never see card data).
      setCardSetup({
        bookingId: result.bookingId,
        setupIntentClientSecret: result.setupIntentClientSecret,
        sessionPriceCents: result.sessionPriceCents,
        noShowFeeCents: result.noShowFeeCents,
      })
      setSubmitting(false)

      // Scroll the card step into view
      setTimeout(() => {
        cardSetupRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const { price } = selectedDate ? calculatePrice(selectedDate, duration, racerCount) : { price: 0 }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-apex-red/10 border border-apex-red text-apex-red telemetry-text">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Section 1: Session Setup */}
          <div className="space-y-6">
            <h3 className="racing-headline text-2xl text-grid-white">
              1. Session <span className="text-apex-red">Setup</span>
            </h3>
            <RacerCountSelector value={racerCount} onChange={setRacerCount} />
            <DurationSelector value={duration} onChange={setDuration} />
          </div>

          <div className="border-t border-white/10" />

          {/* Section 2: Date & Time */}
          <div className="space-y-6">
            <h3 className="racing-headline text-2xl text-grid-white">
              2. Date &amp; <span className="text-telemetry-cyan">Time</span>
            </h3>
            <BookingCalendar
              value={selectedDate}
              onChange={(date) => {
                setSelectedDate(date)
                setSelectedTime(null)
              }}
              duration={duration}
              racerCount={racerCount}
            />
            <TimeSlotPicker
              date={selectedDate}
              duration={duration}
              racerCount={racerCount}
              value={selectedTime}
              onChange={setSelectedTime}
            />
          </div>

          <div className="border-t border-white/10" />

          {/* Section 3: Your Details */}
          <div className="space-y-6">
            <h3 className="racing-headline text-2xl text-grid-white">
              3. Your <span className="text-telemetry-cyan">Details</span>
            </h3>
            <CustomerInfoForm
              value={customerInfo}
              onChange={setCustomerInfo}
              errors={customerErrors}
            />
            {racerCount > 1 && (
              <AdditionalRacerForm
                racerCount={racerCount as 2 | 3}
                racers={additionalRacers}
                onChange={setAdditionalRacers}
                errors={racerErrors}
              />
            )}
          </div>

          <div className="border-t border-white/10" />

          {/* Section 4: Waiver & Consent */}
          <div className="space-y-6">
            <h3 className="racing-headline text-2xl text-grid-white">
              4. Waiver &amp; <span className="text-telemetry-cyan">Consent</span>
            </h3>
            <WaiverSection
              waiverAccepted={waiverAccepted}
              onWaiverChange={setWaiverAccepted}
              noShowConsentAccepted={noShowConsentAccepted}
              onNoShowConsentChange={setNoShowConsentAccepted}
              noShowFeeCents={calculateNoShowFeeCents(racerCount)}
              marketingOptIn={marketingOptIn}
              onMarketingChange={setMarketingOptIn}
              error={waiverError}
              noShowConsentError={noShowConsentError}
            />
          </div>

          {/* Review Button */}
          {!showConfirmation && (
            <div className="pt-6 border-t border-white/10">
              <button
                type="button"
                onClick={handleReviewBooking}
                className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-xl hover:bg-apex-red/90 transition-colors"
              >
                Review Booking
              </button>
            </div>
          )}

          {/* Confirmation Section */}
          {showConfirmation && (
            <div ref={confirmRef} className="space-y-6 pt-6 border-t border-white/10">
              <h3 className="racing-headline text-2xl text-grid-white">
                Review Your <span className="text-apex-red">Booking</span>
              </h3>

              <div className="bg-asphalt-dark border border-white/10 p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="telemetry-text text-xs text-pit-gray">Date</p>
                    <p className="telemetry-text text-lg text-grid-white">
                      {selectedDate && formatDateLong(selectedDate)}
                    </p>
                  </div>
                  <div>
                    <p className="telemetry-text text-xs text-pit-gray">Time</p>
                    <p className="telemetry-text text-lg text-grid-white">{selectedTime}</p>
                  </div>
                  <div>
                    <p className="telemetry-text text-xs text-pit-gray">Duration</p>
                    <p className="telemetry-text text-lg text-grid-white">
                      {duration} hour{duration > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div>
                    <p className="telemetry-text text-xs text-pit-gray">Racers</p>
                    <p className="telemetry-text text-lg text-grid-white">{racerCount}</p>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4">
                  <p className="telemetry-text text-xs text-pit-gray">Primary Racer</p>
                  <p className="telemetry-text text-lg text-grid-white">
                    {customerInfo.firstName} {customerInfo.lastName}
                  </p>
                  <p className="telemetry-text text-sm text-pit-gray">
                    {customerInfo.email} &bull; {customerInfo.phone}
                  </p>
                </div>

                {racerCount > 1 && (
                  <div className="border-t border-white/10 pt-4">
                    <p className="telemetry-text text-xs text-pit-gray mb-2">Additional Racers</p>
                    {additionalRacers.slice(0, racerCount - 1).map((racer, i) => (
                      <div key={i} className="mb-2">
                        <p className="telemetry-text text-grid-white">{racer.name}</p>
                        <p className="telemetry-text text-sm text-pit-gray">
                          {racer.email} &bull; {racer.phone}
                        </p>
                      </div>
                    ))}
                    <p className="telemetry-text text-xs text-telemetry-cyan mt-2">
                      We&apos;ll send a courtesy FYI email to anyone whose email you provided.
                      All waivers are signed at the front desk on arrival.
                    </p>
                  </div>
                )}

                {/* Discount code */}
                <div className="border-t border-white/10 pt-4">
                  {appliedDiscount ? (
                    <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 px-3 py-2">
                      <p className="telemetry-text text-sm text-green-400">
                        Code <span className="font-bold">{appliedDiscount.code}</span> applied
                        {' '}(&minus;${(appliedDiscount.discountCents / 100).toFixed(2)})
                      </p>
                      <button
                        type="button"
                        onClick={removeDiscount}
                        className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase tracking-wider"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
                        Discount code <span className="text-pit-gray/60">(optional)</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              applyDiscount()
                            }
                          }}
                          placeholder="ENTER CODE"
                          className="flex-1 bg-asphalt-dark border border-white/20 text-grid-white telemetry-text uppercase px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={applyDiscount}
                          disabled={discountChecking || !discountInput.trim()}
                          className="px-5 py-2 border border-telemetry-cyan/50 text-telemetry-cyan telemetry-text uppercase tracking-wider hover:bg-telemetry-cyan/10 transition-colors disabled:opacity-40"
                        >
                          {discountChecking ? '…' : 'Apply'}
                        </button>
                      </div>
                      {discountError && (
                        <p className="telemetry-text text-xs text-apex-red mt-1.5">{discountError}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 pt-4 space-y-2">
                  {appliedDiscount ? (
                    <>
                      <div className="flex justify-between items-center">
                        <p className="telemetry-text text-sm text-pit-gray">Session Price</p>
                        <p className="telemetry-text text-lg text-pit-gray line-through">${price}</p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="telemetry-text text-sm text-green-400">Discount</p>
                        <p className="telemetry-text text-lg text-green-400">
                          &minus;${(appliedDiscount.discountCents / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="telemetry-text text-pit-gray">You Pay</p>
                        <p className="racing-headline text-4xl text-apex-red">${formatDollarsCompact(Math.max(0, price * 100 - appliedDiscount.discountCents))}</p>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <p className="telemetry-text text-pit-gray">Session Price</p>
                      <p className="racing-headline text-4xl text-apex-red">${price}</p>
                    </div>
                  )}
                  <p className="telemetry-text text-xs text-pit-gray">
                    Paid in person at your session — cash or card.
                  </p>
                  <p className="telemetry-text text-xs text-telemetry-cyan">
                    Card on file charged only if you no-show: ${(calculateNoShowFeeCents(racerCount) / 100).toFixed(0)} ($20/seat).
                  </p>
                </div>
              </div>

              <div className="bg-telemetry-cyan/10 border border-telemetry-cyan/30 p-4">
                <p className="telemetry-text text-sm text-telemetry-cyan">
                  <strong>Location:</strong> 1205 W Main St, Fort Wayne, IN
                </p>
                <p className="telemetry-text text-sm text-pit-gray mt-1">
                  Please arrive 10 minutes early for your session
                </p>
              </div>

              {!cardSetup && (
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      // Editing can change racers/hours/date → the session price,
                      // so drop any applied code; they can re-apply after.
                      removeDiscount()
                      setShowConfirmation(false)
                    }}
                    className="px-6 py-3 border border-white/20 text-grid-white telemetry-text hover:border-white/40 transition-colors"
                  >
                    Edit Booking
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 px-8 py-3 bg-apex-red text-white racing-headline hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                        Preparing checkout...
                      </>
                    ) : (
                      'Continue to Payment'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Card setup step — appears after the booking row is created in Supabase.
              The <Elements> provider hydrates Stripe.js with the SetupIntent's
              client_secret; <CardSetupForm /> handles the actual card collection. */}
          {cardSetup && (
            <div ref={cardSetupRef} className="space-y-6 pt-6 border-t border-white/10">
              <div>
                <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider">
                  Step 5 of 5
                </p>
                <h3 className="racing-headline text-2xl text-grid-white">
                  Save Your <span className="text-telemetry-cyan">Card</span>
                </h3>
                <p className="telemetry-text text-sm text-pit-gray mt-1">
                  Booking <span className="text-grid-white">{cardSetup.bookingId}</span> reserved.
                  Save a card to lock it in — your card isn&apos;t charged today.
                </p>
              </div>
              <Elements
                stripe={getStripePromise()}
                options={{
                  clientSecret: cardSetup.setupIntentClientSecret,
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#E62322',
                      colorBackground: '#0D0D0D',
                      colorText: '#F5F5F5',
                      colorDanger: '#E62322',
                      fontFamily: 'JetBrains Mono, monospace',
                      borderRadius: '0px',
                    },
                  },
                }}
              >
                <CardSetupForm
                  bookingId={cardSetup.bookingId}
                  sessionPriceCents={cardSetup.sessionPriceCents}
                  noShowFeeCents={cardSetup.noShowFeeCents}
                  customerFirstName={customerInfo.firstName}
                  customerEmail={customerInfo.email}
                />
              </Elements>
            </div>
          )}
        </div>

        {/* Sidebar - Price Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-4">
            <PriceSummary
              date={selectedDate}
              duration={duration}
              racerCount={racerCount}
              startTime={selectedTime}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
