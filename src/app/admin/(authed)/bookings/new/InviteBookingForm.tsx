'use client'

// Admin invite-to-booking form. Creates a card-less booking that emails the
// customer + owner and drops it on the Gmail calendar. Shows a live price
// (collected in person) and warns on closed days.
import { useState } from 'react'
import Link from 'next/link'
import { calculatePrice, getDayType, formatPrice } from '@/lib/pricing'

type Unit = 1 | 2 | 3

function timeOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = []
  const push = (h: number, m: number) => {
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const period = h >= 12 ? 'PM' : 'AM'
    const dh = h % 12 || 12
    opts.push({ value, label: `${dh}:${String(m).padStart(2, '0')} ${period}` })
  }
  for (let h = 12; h <= 23; h++) {
    push(h, 0)
    push(h, 30)
  }
  for (const h of [0, 1]) {
    push(h, 0)
    push(h, 30)
  }
  return opts
}

const TIME_OPTIONS = timeOptions()

export default function InviteBookingForm() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [startTime, setStartTime] = useState('18:00')
  const [durationHours, setDurationHours] = useState<Unit>(1)
  const [racerCount, setRacerCount] = useState<Unit>(1)
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ bookingId: string } | null>(null)

  const dayType = sessionDate ? getDayType(sessionDate) : null
  const pricePreview =
    sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
      ? calculatePrice(sessionDate, durationHours, racerCount).price
      : null

  async function submit() {
    setError(null)
    if (!email.includes('@')) {
      setError('Enter a valid customer email.')
      return
    }
    if (!sessionDate) {
      setError('Pick a date.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/bookings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          sessionDate,
          startTime,
          durationHours,
          racerCount,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Invite failed')
      setResult({ bookingId: data.bookingId })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setResult(null)
    setEmail('')
    setFirstName('')
    setLastName('')
    setPhone('')
    setNotes('')
  }

  if (result) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 p-8 text-center space-y-4 max-w-xl">
        <div className="text-5xl">✓</div>
        <h2 className="racing-headline text-2xl text-grid-white">Booking created &amp; sent</h2>
        <p className="telemetry-text text-sm text-pit-gray">
          Booking <span className="text-grid-white">{result.bookingId}</span> is on the calendar.
          We emailed {email} and notified MC Racing.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={`/admin/bookings/${result.bookingId}`}
            className="telemetry-text text-sm uppercase tracking-wider bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/40 hover:bg-telemetry-cyan/25 px-4 py-2.5"
          >
            View booking
          </Link>
          <button
            type="button"
            onClick={reset}
            className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-5 py-2.5"
          >
            Invite another
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
        {/* Customer */}
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Customer email *
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="composer-input"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              First name <span className="text-pit-gray/60">(optional)</span>
            </label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="composer-input" />
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Last name <span className="text-pit-gray/60">(optional)</span>
            </label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="composer-input" />
          </div>
        </div>
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Phone <span className="text-pit-gray/60">(optional)</span>
          </label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="composer-input" />
        </div>

        {/* Session */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Date *
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="composer-input"
            />
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Start time *
            </label>
            <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="composer-input">
              {TIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Hours <span className="text-pit-gray/60">(default 1)</span>
            </label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(parseInt(e.target.value, 10) as Unit)}
              className="composer-input"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
              <option value={3}>3 hours</option>
            </select>
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Racers
            </label>
            <select
              value={racerCount}
              onChange={(e) => setRacerCount(parseInt(e.target.value, 10) as Unit)}
              className="composer-input"
            >
              <option value={1}>1 racer</option>
              <option value={2}>2 racers</option>
              <option value={3}>3 racers</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Notes <span className="text-pit-gray/60">(optional, internal)</span>
          </label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="composer-input resize-y" />
        </div>

        {/* Price preview */}
        {pricePreview !== null && (
          <div className="flex items-center justify-between bg-asphalt border border-white/10 px-4 py-3">
            <span className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
              Session price (due at venue)
            </span>
            <span className="racing-headline text-xl text-telemetry-cyan">{formatPrice(pricePreview)}</span>
          </div>
        )}
        {dayType === 'closed' && (
          <p className="telemetry-text text-xs text-amber-400">
            ⚠ The venue is normally closed Mondays — double-check this date.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
      >
        {submitting ? 'Creating…' : 'Create booking & send invite →'}
      </button>
      <p className="telemetry-text text-xs text-pit-gray">
        No card is collected. The customer gets an email, MC Racing gets notified,
        it&apos;s added to the Gmail calendar, and they&apos;ll get a reminder the day before.
      </p>
    </div>
  )
}
