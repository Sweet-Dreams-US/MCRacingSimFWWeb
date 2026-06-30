'use client'

import { useState, useEffect, useRef } from 'react'

interface CustomerHit {
  id: string
  name: string
  email: string
  phone: string | null
}

type SaleType = 'in_person_sale' | 'booking_income' | 'other_income'
type Phase = 'form' | 'waiting' | 'paid' | 'failed'

export default function PosClient({ readerOnline }: { readerOnline: boolean }) {
  // Sale form state
  const [amount, setAmount] = useState('')
  const [saleType, setSaleType] = useState<SaleType>('in_person_sale')
  const [description, setDescription] = useState('')
  const [bookingId, setBookingId] = useState('')

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState('')
  const [hits, setHits] = useState<CustomerHit[]>([])
  const [selected, setSelected] = useState<CustomerHit | null>(null)

  // Charge lifecycle
  const [phase, setPhase] = useState<Phase>('form')
  const [error, setError] = useState<string | null>(null)
  const [intentId, setIntentId] = useState<string | null>(null)
  const [readerId, setReaderId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
  const canCharge =
    readerOnline && amountCents >= 50 && description.trim() !== '' && phase === 'form'

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
          bookingId: bookingId.trim() || null,
          receiptEmail: selected?.email ?? null,
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
    setAmount('')
    setDescription('')
    setBookingId('')
    setCustomerQuery('')
    setSelected(null)
    setHits([])
    setSaleType('in_person_sale')
  }

  // ---- Waiting / paid / failed screens -----------------------------------
  if (phase === 'waiting') {
    return (
      <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-8 text-center space-y-4">
        <div className="animate-spin w-10 h-10 border-2 border-telemetry-cyan border-t-transparent rounded-full mx-auto" />
        <h2 className="racing-headline text-2xl text-grid-white">
          Tap Card on <span className="text-telemetry-cyan">Reader</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          Charging <span className="text-grid-white">${(amountCents / 100).toFixed(2)}</span>
          {selected ? <> to <span className="text-grid-white">{selected.name}</span></> : null}.
          Ask the customer to tap, insert, or swipe.
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
    return (
      <div className="bg-green-500/10 border border-green-500/30 p-8 text-center space-y-4">
        <div className="text-5xl">✓</div>
        <h2 className="racing-headline text-2xl text-grid-white">
          Payment <span className="text-green-400">Approved</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          ${(amountCents / 100).toFixed(2)} charged
          {selected ? <> to {selected.name}</> : null}.
          {selected?.email ? ` Receipt sent to ${selected.email}.` : ''}
        </p>
        <button type="button" onClick={resetForm} className="btn-primary">
          New Sale
        </button>
      </div>
    )
  }

  // ---- Sale form (form + failed both show the form) -----------------------
  return (
    <div className="space-y-6">
      {phase === 'failed' && error && (
        <div className="bg-apex-red/10 border border-apex-red p-4">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <div className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
        {/* Amount */}
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
            Amount ($) *
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
            onChange={(e) => setSaleType(e.target.value as SaleType)}
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

        {/* Booking link (optional) */}
        {saleType === 'booking_income' && (
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
              Booking # <span className="text-pit-gray/60">(optional — links the payment to a booking)</span>
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
            Customer <span className="text-pit-gray/60">(optional — links sale + sends receipt)</span>
          </label>
          {selected ? (
            <div className="flex items-center justify-between bg-telemetry-cyan/10 border border-telemetry-cyan/30 px-4 py-3">
              <div>
                <p className="telemetry-text text-grid-white">{selected.name}</p>
                <p className="telemetry-text text-xs text-pit-gray">{selected.email}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setCustomerQuery('') }}
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

      <button
        type="button"
        onClick={startCharge}
        disabled={!canCharge}
        className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-xl hover:bg-apex-red/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {amountCents >= 50 ? `Charge $${(amountCents / 100).toFixed(2)} on Reader` : 'Charge on Reader'}
      </button>
      {!readerOnline && (
        <p className="telemetry-text text-xs text-amber-400 text-center">
          Reader must be online to charge. Check it&apos;s powered on and connected to Wi-Fi.
        </p>
      )}
    </div>
  )
}
