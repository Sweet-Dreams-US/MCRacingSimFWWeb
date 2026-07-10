'use client'

import { useState, useEffect, useRef } from 'react'
import BookingSlider, { type BookingHit } from './BookingSlider'

interface CustomerHit {
  id: string
  name: string
  email: string | null
  phone: string | null
}

type SaleType = 'in_person_sale' | 'booking_income' | 'other_income'
type Phase = 'form' | 'waiting' | 'paid' | 'failed'

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function dayLabel(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function PosClient({
  readerOnline,
  taxRateBps,
}: {
  readerOnline: boolean
  taxRateBps: number
}) {
  // Sale form state
  const [amount, setAmount] = useState('')
  const [saleType, setSaleType] = useState<SaleType>('in_person_sale')
  const [description, setDescription] = useState('')
  const [bookingId, setBookingId] = useState('')

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState('')
  const [hits, setHits] = useState<CustomerHit[]>([])
  const [selected, setSelected] = useState<CustomerHit | null>(null)

  // Booking selector
  const [bookings, setBookings] = useState<BookingHit[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [today, setToday] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<BookingHit | null>(null)
  const [prefillCents, setPrefillCents] = useState<number | null>(null)

  // Charge lifecycle
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [intentId, setIntentId] = useState<string | null>(null)
  const [readerId, setReaderId] = useState<string | null>(null)
  const [paidCents, setPaidCents] = useState<number | null>(null)
  const [tipCents, setTipCents] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load upcoming bookings for the selector
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const res = await fetch('/api/admin/bookings/search')
      const data = await res.json()
      setBookings(data.bookings ?? [])
      setToday(data.today ?? '')
    } catch {
      /* slider just shows empty — walk-in flow still works */
    } finally {
      setBookingsLoading(false)
    }
  }
  useEffect(() => { loadBookings() }, [])

  // Debounced customer search
  useEffect(() => {
    if (selected || customerQuery.trim().length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(customerQuery)}`)
      const data = await res.json()
      setHits(data.customers ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [customerQuery, selected])

  // Cleanup poller
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const amountCents = Math.round(parseFloat(amount || '0') * 100)
  // Tax is added server-side on charge; mirror it here so staff/customer see
  // the breakdown + real total before paying.
  const taxCents = amountCents > 0 ? Math.round((amountCents * taxRateBps) / 10000) : 0
  const totalCents = amountCents + taxCents
  const taxPctLabel = `${Number.isInteger(taxRateBps / 100) ? (taxRateBps / 100).toFixed(0) : (taxRateBps / 100).toFixed(2)}%`
  const canCharge =
    readerOnline && amountCents >= 50 && description.trim() !== '' && phase === 'form'

  // Selecting a booking prefills time, customer, and price.
  const handleSelectBooking = (b: BookingHit) => {
    // Picking a booking re-arms the form if a prior charge had failed.
    if (phase === 'failed') {
      setPhase('form')
      setError(null)
    }
    setSelectedBooking(b)
    setPrefillCents(b.sessionPriceCents)
    setAmount((b.sessionPriceCents / 100).toFixed(2))
    setSaleType('booking_income')
    setBookingId(b.id)
    setDescription(
      `${dayLabel(b.sessionDate, today)} ${formatTime(b.startTime)} — ${b.racerCount} racer${b.racerCount > 1 ? 's' : ''}, ${b.durationHours}h`
    )
    if (b.customer) {
      setSelected({
        id: b.customer.id,
        name: b.customer.name,
        email: b.customer.email,
        phone: b.customer.phone,
      })
    } else {
      setSelected(null)
    }
    setCustomerQuery('')
    setHits([])
  }

  // Detach the booking link only. Used when the linked booking no longer matches
  // the form — staff changed the customer or switched the sale type away from a
  // booking. This prevents the recorded charge from carrying a booking_id that
  // belongs to a DIFFERENT customer than the one being charged (accounting desync).
  const detachBooking = () => {
    setSelectedBooking(null)
    setPrefillCents(null)
    setBookingId('')
  }

  // The "Clear" button on the banner: forget the booking entirely and return to
  // a clean walk-in state so the next sale isn't mislabeled with the old
  // booking's type/description.
  const clearBooking = () => {
    detachBooking()
    setSaleType('in_person_sale')
    setDescription('')
  }

  // Override indicators
  const priceEdited =
    selectedBooking != null && prefillCents != null && amountCents !== prefillCents
  const bookingCustomerId = selectedBooking?.customer?.id ?? null
  const customerEdited =
    selectedBooking != null && (selected?.id ?? null) !== bookingCustomerId

  const startCharge = async () => {
    setError(null)
    setPhase('waiting')
    try {
      const res = await fetch('/api/admin/pos/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          type: saleType,
          description: description.trim(),
          customerId: selected?.id ?? null,
          // Only link a booking when this is actually a session payment, so a
          // walk-in/other sale can't carry a stale booking_id into accounting.
          bookingId: saleType === 'booking_income' ? bookingId.trim() || null : null,
          receiptEmail: selected?.email || null,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'Could not start the charge.')
        setPhase('failed')
        return
      }
      setIntentId(data.paymentIntentId)
      setReaderId(data.readerId)
      pollStatus(data.paymentIntentId)
    } catch {
      setError('Network error starting the charge.')
      setPhase('failed')
    }
  }

  const pollStatus = (pi: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/pos/status?paymentIntentId=${pi}`)
        const data = await res.json()
        if (data.state === 'paid') {
          stopPolling()
          setPaidCents(data.amountCents ?? amountCents)
          setTipCents(data.tipCents ?? 0)
          setPhase('paid')
        } else if (data.state === 'failed') {
          stopPolling()
          setError(data.lastError ?? 'Card declined or cancelled.')
          setPhase('failed')
        }
      } catch {
        /* keep polling */
      }
    }, 2000)
  }

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }

  const cancelCharge = async () => {
    stopPolling()
    if (intentId && readerId) {
      await fetch('/api/admin/pos/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: intentId, readerId }),
      }).catch(() => {})
    }
    resetForm()
  }

  const resetForm = () => {
    setPhase('form')
    setError(null)
    setIntentId(null)
    setReaderId(null)
    setPaidCents(null)
    setTipCents(0)
    setAmount('')
    setDescription('')
    setBookingId('')
    setCustomerQuery('')
    setSelected(null)
    setHits([])
    setSaleType('in_person_sale')
    setSelectedBooking(null)
    setPrefillCents(null)
    loadBookings()
  }

  // ---- Waiting / paid screens (full width, no slider) --------------------
  if (phase === 'waiting') {
    return (
      <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-8 text-center space-y-4 max-w-2xl">
        <div className="animate-spin w-10 h-10 border-2 border-telemetry-cyan border-t-transparent rounded-full mx-auto" />
        <h2 className="racing-headline text-2xl text-grid-white">
          Tap Card on <span className="text-telemetry-cyan">Reader</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          <span className="text-grid-white">${(amountCents / 100).toFixed(2)}</span> subtotal
          {selected ? <> for <span className="text-grid-white">{selected.name}</span></> : null}.
          The reader will ask the customer to <span className="text-telemetry-cyan">choose a tip</span>,
          then tap, insert, or swipe.
        </p>
        <button
          type="button"
          onClick={cancelCharge}
          className="px-6 py-2 border border-white/20 text-grid-white telemetry-text hover:border-apex-red hover:text-apex-red transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (phase === 'paid') {
    const total = paidCents ?? amountCents
    return (
      <div className="bg-green-500/10 border border-green-500/30 p-8 text-center space-y-4 max-w-2xl">
        <div className="text-5xl">✓</div>
        <h2 className="racing-headline text-2xl text-grid-white">
          Payment <span className="text-green-400">Approved</span>
        </h2>
        <p className="racing-headline text-3xl text-grid-white">
          ${(total / 100).toFixed(2)}
        </p>
        {tipCents > 0 && (
          <p className="telemetry-text text-sm text-telemetry-cyan">
            Includes ${(tipCents / 100).toFixed(2)} tip 🎉
          </p>
        )}
        <p className="telemetry-text text-sm text-pit-gray">
          Charged{selected ? <> to {selected.name}</> : null}.
          {selected?.email ? ` Receipt sent to ${selected.email}.` : ''}
        </p>
        <button type="button" onClick={resetForm} className="btn-primary">
          New Sale
        </button>
      </div>
    )
  }

  // ---- Sale form (form + failed) with booking slider ----------------------
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
      {/* Booking selector — top on mobile, right on desktop */}
      <div className="lg:order-2 lg:sticky lg:top-6 lg:self-start">
        <BookingSlider
          bookings={bookings}
          selectedId={selectedBooking?.id ?? null}
          onSelect={handleSelectBooking}
          loading={bookingsLoading}
          today={today}
        />
      </div>

      {/* Sale form */}
      <div className="lg:order-1 space-y-6">
        {phase === 'failed' && error && (
          <div className="bg-apex-red/10 border border-apex-red p-4 flex items-center justify-between gap-3">
            <p className="telemetry-text text-sm text-apex-red">{error}</p>
            <button
              type="button"
              onClick={() => { setPhase('form'); setError(null) }}
              className="telemetry-text text-xs uppercase tracking-wider border border-apex-red/50 text-apex-red hover:bg-apex-red/10 px-3 py-1.5 flex-shrink-0"
            >
              Try again
            </button>
          </div>
        )}

        {/* Linked-booking banner */}
        {selectedBooking && (
          <div className="bg-telemetry-cyan/10 border border-telemetry-cyan/30 p-4 flex items-start justify-between gap-3">
            <div>
              <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider">
                Linked booking {selectedBooking.id}
              </p>
              <p className="telemetry-text text-sm text-grid-white mt-0.5">
                {dayLabel(selectedBooking.sessionDate, today)} · {formatTime(selectedBooking.startTime)}
                {selectedBooking.customer ? <> · {selectedBooking.customer.name}</> : null}
              </p>
              {(priceEdited || customerEdited) && (
                <div className="flex gap-2 mt-2">
                  {priceEdited && (
                    <span className="telemetry-text text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                      Price edited
                    </span>
                  )}
                  {customerEdited && (
                    <span className="telemetry-text text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
                      Customer changed
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={clearBooking}
              className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase flex-shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        <div className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
          {/* Amount */}
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Amount ($) *
              {selectedBooking && (
                <span className="text-pit-gray/60 normal-case tracking-normal">
                  {' '}— prefilled from booking, edit only if needed
                </span>
              )}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0.50"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white racing-headline text-2xl focus:border-telemetry-cyan focus:outline-none"
            />
          </div>

          {/* Sale type */}
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Type
            </label>
            <select
              value={saleType}
              onChange={(e) => {
                const v = e.target.value as SaleType
                setSaleType(v)
                // A non-booking sale shouldn't keep a booking linked.
                if (v !== 'booking_income' && selectedBooking) detachBooking()
              }}
              className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none"
            >
              <option value="in_person_sale">In-person sale (walk-in / party / event)</option>
              <option value="booking_income">Session payment (for a booking)</option>
              <option value="other_income">Other income</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Description *
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 1-hour session, 2 racers"
              className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none"
            />
          </div>

          {/* Booking link (optional, free-text fallback) */}
          {saleType === 'booking_income' && !selectedBooking && (
            <div>
              <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
                Booking # <span className="text-pit-gray/60">(optional — or pick from the list)</span>
              </label>
              <input
                type="text"
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value.toUpperCase())}
                placeholder="MC-XXXXXXX"
                className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none uppercase"
              />
            </div>
          )}

          {/* Customer picker */}
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Customer{' '}
              <span className="text-pit-gray/60">
                {selectedBooking ? '(from booking — change only if needed)' : '(optional — links sale + sends receipt)'}
              </span>
            </label>
            {selected ? (
              <div className="flex items-center justify-between bg-telemetry-cyan/10 border border-telemetry-cyan/30 px-4 py-3">
                <div>
                  <p className="telemetry-text text-grid-white">{selected.name}</p>
                  {selected.email && (
                    <p className="telemetry-text text-xs text-pit-gray">{selected.email}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null)
                    setCustomerQuery('')
                    // Changing the payer invalidates the booking link — detach it
                    // so we never record a charge for booking A under customer B.
                    if (selectedBooking) detachBooking()
                  }}
                  className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none"
                />
                {hits.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-asphalt-dark border border-white/20 max-h-60 overflow-y-auto">
                    {hits.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => { setSelected(h); setHits([]) }}
                        className="w-full text-left px-4 py-2 hover:bg-white/5 border-b border-white/5 last:border-b-0"
                      >
                        <p className="telemetry-text text-sm text-grid-white">{h.name}</p>
                        <p className="telemetry-text text-xs text-pit-gray">{h.email}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tax breakdown — shows the customer/staff the add-on + real total */}
        {amountCents >= 50 && taxCents > 0 && (
          <div className="border border-white/10 bg-asphalt-dark p-4 space-y-1.5">
            <div className="flex justify-between telemetry-text text-sm text-pit-gray">
              <span>Subtotal</span>
              <span className="text-grid-white">${(amountCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between telemetry-text text-sm text-pit-gray">
              <span>Sales tax ({taxPctLabel})</span>
              <span className="text-grid-white">${(taxCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between telemetry-text text-base font-bold border-t border-white/10 pt-1.5">
              <span className="text-grid-white">Total</span>
              <span className="text-telemetry-cyan">${(totalCents / 100).toFixed(2)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={startCharge}
          disabled={!canCharge}
          className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-xl hover:bg-apex-red/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {amountCents >= 50 ? `Charge $${(totalCents / 100).toFixed(2)} on Reader` : 'Charge on Reader'}
        </button>
        {!readerOnline && (
          <p className="telemetry-text text-xs text-amber-400 text-center">
            Reader must be online to charge. Check it&apos;s powered on and connected to Wi-Fi.
          </p>
        )}
      </div>
    </div>
  )
}
