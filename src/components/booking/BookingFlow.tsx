'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import RacerCountSelector from './RacerCountSelector'
import DurationSelector from './DurationSelector'
import BookingCalendar from './BookingCalendar'
import TimeSlotPicker from './TimeSlotPicker'
import CustomerInfoForm from './CustomerInfoForm'
import AdditionalRacerForm from './AdditionalRacerForm'
import WaiverSection from './WaiverSection'
import PriceSummary from './PriceSummary'
import { calculatePrice, formatDateLong } from '@/lib/pricing'

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
  const confirmRef = useRef<HTMLDivElement>(null)

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
  const [smsConsent, setSmsConsent] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)

  // Validation errors
  const [customerErrors, setCustomerErrors] = useState<Partial<Record<keyof CustomerInfo, string>>>({})
  const [racerErrors, setRacerErrors] = useState<{ [key: number]: Partial<Record<keyof AdditionalRacer, string>> }>({})
  const [waiverError, setWaiverError] = useState<string | undefined>()
  const [smsConsentError, setSmsConsentError] = useState<string | undefined>()

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

      if (!racer.name.trim()) racerError.name = 'Required'
      if (!racer.phone.trim()) racerError.phone = 'Required'
      if (!racer.email.trim()) {
        racerError.email = 'Required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(racer.email)) {
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
    if (!smsConsent) {
      setSmsConsentError('You must consent to SMS notifications to complete your booking')
      valid = false
    } else {
      setSmsConsentError(undefined)
    }
    return valid
  }

  const handleReviewBooking = () => {
    setError(null)

    if (!selectedDate || !selectedTime) {
      setError('Please select both a date and time')
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

      // Calculate end time
      let endHour = hour24 + duration
      const endPeriod = endHour >= 12 && endHour < 24 ? 'PM' : 'AM'
      if (endHour >= 24) endHour -= 24
      const displayEndHour = endHour % 12 || 12
      const endTime = `${displayEndHour}:${String(minutes).padStart(2, '0')} ${endPeriod}`

      const { price } = calculatePrice(selectedDate!, duration, racerCount)

      // Format data to match Google Apps Script expectations
      const bookingData = {
        type: 'booking', // Script expects 'type' not 'action'
        sessionDate: selectedDate,
        startTime: startTime24, // 24-hour format like "14:00"
        duration: String(duration),
        numberOfRacers: racerCount, // Script expects 'numberOfRacers'
        price: String(price),
        // Primary racer - separate fields
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        birthday: customerInfo.birthday,
        phone: customerInfo.phone,
        email: customerInfo.email,
        howDidYouHear: customerInfo.howHeard,
        signedWaiver: true,
        smsConsent: true,
        marketingOptIn,
        // Additional racers
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

      // Use our API route to avoid CORS issues with Google Apps Script
      const response = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Booking failed')
      }

      // Send SMS notifications via our API routes
      try {
        await fetch('/api/sms/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: result.bookingId,
            customerPhone: customerInfo.phone,
            customerName: `${customerInfo.firstName} ${customerInfo.lastName}`,
            date: selectedDate,
            startTime: selectedTime, // Keep 12-hour format for SMS display
            endTime,
            racerCount,
            duration,
            price,
            additionalRacers: racerCount > 1 ? additionalRacers.slice(0, racerCount - 1) : [],
          }),
        })
      } catch (smsError) {
        console.error('SMS error:', smsError)
        // Don't fail the booking if SMS fails
      }

      // Redirect to confirmation page
      const params = new URLSearchParams({
        bookingId: result.bookingId,
        date: selectedDate!,
        time: selectedTime!,
        duration: duration.toString(),
        racers: racerCount.toString(),
        price: price.toString(),
        name: customerInfo.firstName,
      })
      router.push(`/book/confirmation?${params.toString()}`)
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
              smsConsent={smsConsent}
              onSmsConsentChange={setSmsConsent}
              marketingOptIn={marketingOptIn}
              onMarketingChange={setMarketingOptIn}
              error={waiverError}
              smsConsentError={smsConsentError}
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
                      They will receive an SMS to complete their waiver
                    </p>
                  </div>
                )}

                <div className="border-t border-white/10 pt-4">
                  <div className="flex justify-between items-center">
                    <p className="telemetry-text text-pit-gray">Total Due</p>
                    <p className="racing-headline text-4xl text-apex-red">${price}</p>
                  </div>
                  <p className="telemetry-text text-xs text-pit-gray mt-2">
                    Payment collected in person after your session
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

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowConfirmation(false)}
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
                      Booking...
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              </div>
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
