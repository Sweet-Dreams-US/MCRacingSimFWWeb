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
  const [requireCard, setRequireCard] = useState(false)
  // Blank = use the standard racers×hours price for the date.
  const [price, setPrice] = useState('')
  const [sendCustomerEmail, setSendCustomerEmail] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    bookingId: string
    requireCard: boolean
    holdCardUrl: string | null
    emailed: boolean
    hadEmail: boolean
  } | null>(null)

  const dayType = sessionDate ? getDayType(sessionDate) : null
  const pricePreview =
    sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
      ? calculatePrice(sessionDate, durationHours, racerCount).price
      : null
  // No email = a bare slot block: no customer, nothing to send.
  const hasEmail = email.trim().length > 0

  async function submit() {
    setError(null)
    if (hasEmail && !email.includes('@')) {
      setError('That email address is not valid.')
      return
    }
    if (!hasEmail && requireCard) {
      setError('A customer email is required to request a no-show card.')
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
          email: email.trim() || undefined,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          phone: phone.trim() || undefined,
          sessionDate,
          startTime,
          durationHours,
          racerCount,
          notes: notes.trim() || undefined,
          requireCard,
          price: price.trim() || undefined,
          sendCustomerEmail,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Invite failed')
      setResult({
        bookingId: data.bookingId,
        requireCard: !!data.requireCard,
        holdCardUrl: data.holdCardUrl ?? null,
        emailed: !!data.emailed,
        hadEmail: hasEmail,
      })
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
    setRequireCard(false)
    setPrice('')
    setSendCustomerEmail(true)
  }

  if (result) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 p-8 text-center space-y-4 max-w-xl">
        <div className="text-5xl">✓</div>
        <h2 className="racing-headline text-2xl text-grid-white">
          {result.requireCard
            ? 'Invite sent'
            : result.emailed
              ? 'Booking created & sent'
              : 'Booking created'}
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          {result.requireCard ? (
            <>
              Invite <span className="text-grid-white">{result.bookingId}</span> emailed to {email}. It confirms once
              they save a card. It shows here on the schedule after that.
            </>
          ) : result.emailed ? (
            <>
              Booking <span className="text-grid-white">{result.bookingId}</span> is on the calendar. We emailed {email}{' '}
              and notified MC Racing.
            </>
          ) : result.hadEmail ? (
            <>
              Booking <span className="text-grid-white">{result.bookingId}</span> is on the calendar. No email was sent
              to the customer.
            </>
          ) : (
            <>
              Booking <span className="text-grid-white">{result.bookingId}</span> is on the calendar as a held slot —
              no customer attached, no emails sent.
            </>
          )}
        </p>
        {result.requireCard && result.holdCardUrl && (
          <div className="text-left">
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Save-card link (to share directly)
            </label>
            <input
              readOnly
              value={result.holdCardUrl}
              onFocus={(e) => e.target.select()}
              className="composer-input"
            />
          </div>
        )}
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
            Customer email <span className="text-pit-gray/60">(optional)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@example.com"
            className="composer-input"
          />
          <p className="telemetry-text text-[11px] text-pit-gray mt-1.5">
            {hasEmail
              ? 'Links the booking to this customer.'
              : 'Leave blank to just hold the slot — no customer, no emails.'}
          </p>
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

        {/* Price — blank uses the standard matrix price for the date */}
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Price <span className="text-pit-gray/60">(optional — overrides the standard price)</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={pricePreview !== null ? pricePreview.toFixed(2) : 'e.g. 45.00'}
            className="composer-input"
          />
          <p className="telemetry-text text-[11px] text-pit-gray mt-1.5">
            {price.trim()
              ? `Custom price — due at the venue. Standard would be ${pricePreview !== null ? formatPrice(pricePreview) : '—'}.`
              : pricePreview !== null
                ? `Blank = standard ${formatPrice(pricePreview)} for ${racerCount} racer${racerCount > 1 ? 's' : ''} × ${durationHours}h. Due at the venue.`
                : 'Pick a date to see the standard price.'}
          </p>
        </div>

        {/* No-show card toggle */}
        <label className="flex items-start gap-3 bg-asphalt border border-white/10 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={requireCard}
            onChange={(e) => setRequireCard(e.target.checked)}
            disabled={!hasEmail}
            className="mt-1"
          />
          <span className="telemetry-text text-sm text-grid-white">
            Require a no-show card
            <span className="block text-xs text-pit-gray mt-1">
              {!hasEmail
                ? 'Needs a customer email — there’s nobody to send the save-card link to.'
                : requireCard
                  ? 'The customer must save a card (link emailed) before this confirms — a $20/seat no-show fee applies.'
                  : 'Off: card-less, confirms immediately, no no-show fee (the default for invites).'}
            </span>
          </span>
        </label>

        {/* Email toggle — put it on the books without telling the customer */}
        {hasEmail && !requireCard && (
          <label className="flex items-start gap-3 bg-asphalt border border-white/10 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={sendCustomerEmail}
              onChange={(e) => setSendCustomerEmail(e.target.checked)}
              className="mt-1"
            />
            <span className="telemetry-text text-sm text-grid-white">
              Email the customer
              <span className="block text-xs text-pit-gray mt-1">
                {sendCustomerEmail
                  ? 'They get a booking confirmation email.'
                  : 'Off: the booking goes on the calendar quietly — nothing is sent to them.'}
              </span>
            </span>
          </label>
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
        {submitting
          ? 'Creating…'
          : requireCard
            ? 'Send invite & card link →'
            : hasEmail && sendCustomerEmail
              ? 'Create booking & send invite →'
              : 'Create booking →'}
      </button>
      <p className="telemetry-text text-xs text-pit-gray">
        {requireCard
          ? 'The customer gets a link to save a no-show card. The booking confirms (calendar + reminder) once the card is on file.'
          : !hasEmail
            ? 'Holds the slot with no customer attached — nothing is emailed to anyone. It’s added to the Gmail calendar and you can charge it on the reader later.'
            : sendCustomerEmail
              ? 'No card is collected. The customer gets an email, MC Racing gets notified, it’s added to the Gmail calendar, and they’ll get a reminder the day before.'
              : 'No card is collected and the customer is never contacted — no confirmation and no day-before reminder. It’s still linked to them and added to the Gmail calendar.'}
      </p>
    </div>
  )
}
