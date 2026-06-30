'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'

interface LookupResult {
  id: string
  sessionDate: string
  startTime: string
  endTime: string
  durationHours: number
  racerCount: number
  sessionPriceCents: number
  noShowFeeCents: number
  status: string
  cardOnFile: boolean
  customerFirstName: string
  racers: { slot: number; name: string }[]
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  let h = parseInt(hStr, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${mStr} ${period}`
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  partial_noshow: 'Partial No-Show',
  noshow: 'No-Show',
  cancelled: 'Cancelled',
}

export default function BookingLookupForm() {
  const [bookingId, setBookingId] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [notFound, setNotFound] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus('searching')
    setResult(null)
    setNotFound(false)

    try {
      const res = await fetch('/api/booking/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, email }),
      })
      const data = await res.json()
      if (data.found) {
        setResult(data.booking)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setStatus('done')
    }
  }

  if (result) {
    return (
      <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
              Booking
            </p>
            <p className="racing-headline text-2xl text-telemetry-cyan">{result.id}</p>
          </div>
          <span className="telemetry-text text-xs px-3 py-1 bg-telemetry-cyan/20 text-telemetry-cyan uppercase">
            {STATUS_LABELS[result.status] ?? result.status}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="telemetry-text text-xs text-pit-gray">Date</p>
            <p className="telemetry-text text-grid-white">{formatDate(result.sessionDate)}</p>
          </div>
          <div>
            <p className="telemetry-text text-xs text-pit-gray">Time</p>
            <p className="telemetry-text text-grid-white">
              {formatTime(result.startTime)} – {formatTime(result.endTime)}
            </p>
          </div>
          <div>
            <p className="telemetry-text text-xs text-pit-gray">Duration</p>
            <p className="telemetry-text text-grid-white">
              {result.durationHours} hour{result.durationHours > 1 ? 's' : ''}
            </p>
          </div>
          <div>
            <p className="telemetry-text text-xs text-pit-gray">Racers</p>
            <p className="telemetry-text text-grid-white">{result.racerCount}</p>
          </div>
        </div>

        {result.racers.length > 0 && (
          <div>
            <p className="telemetry-text text-xs text-pit-gray mb-1">Racers</p>
            {result.racers.map((r) => (
              <p key={r.slot} className="telemetry-text text-sm text-grid-white">
                {r.slot}. {r.name}
              </p>
            ))}
          </div>
        )}

        <div className="border-t border-white/10 pt-4 space-y-1">
          <div className="flex justify-between telemetry-text text-sm">
            <span className="text-pit-gray">Session price (paid in person)</span>
            <span className="text-grid-white">{formatDollars(result.sessionPriceCents)}</span>
          </div>
          <div className="flex justify-between telemetry-text text-sm">
            <span className="text-pit-gray">Card on file</span>
            <span className={result.cardOnFile ? 'text-green-400' : 'text-amber-400'}>
              {result.cardOnFile ? '✓ Yes' : 'No'}
            </span>
          </div>
          {result.cardOnFile && (
            <p className="telemetry-text text-xs text-pit-gray pt-1">
              No-show fee if you don&apos;t show: {formatDollars(result.noShowFeeCents)} ($20/seat).
              Cancel 24+ hours ahead to avoid it.
            </p>
          )}
        </div>

        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 p-3">
          <p className="telemetry-text text-xs text-pit-gray">
            <span className="text-telemetry-cyan">Location:</span> 1205 W Main St, Fort Wayne, IN 46808
            · Arrive 10 minutes early.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => {
              setResult(null)
              setStatus('idle')
              setBookingId('')
              setEmail('')
            }}
            className="px-6 py-3 border border-white/20 text-grid-white telemetry-text hover:border-white/40 transition-colors text-center"
          >
            Look Up Another
          </button>
          <a
            href="tel:+18082202600"
            className="flex-1 px-6 py-3 bg-apex-red text-white racing-headline text-center hover:bg-apex-red/90 transition-colors"
          >
            Need to Change It? Call Us
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
      <div>
        <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
          Booking Number *
        </label>
        <input
          type="text"
          required
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          placeholder="MC-XXXXXXX"
          className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors uppercase"
        />
      </div>
      <div>
        <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2">
          Email Used to Book *
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors"
        />
      </div>

      {notFound && status === 'done' && (
        <div className="bg-apex-red/10 border border-apex-red px-4 py-3">
          <p className="telemetry-text text-sm text-apex-red">
            No booking found with that number and email. Double-check both, or call us at{' '}
            <a href="tel:+18082202600" className="underline">(808) 220-2600</a>.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'searching' || !bookingId.trim() || !email.trim()}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'searching' ? 'Searching…' : 'Find My Booking'}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Don&apos;t have a booking yet?{' '}
        <Link href="/book" className="text-telemetry-cyan hover:underline">
          Book a session
        </Link>
      </p>
    </form>
  )
}
