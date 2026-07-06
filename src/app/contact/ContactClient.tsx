'use client'

import { useState, type FormEvent } from 'react'
import Button from '@/components/Button'
import { CONTACT_REASONS, CONTACT_REASON_LABELS, EVENT_REASONS, type ContactReason } from '@/lib/contact'
import { metaTrack } from '@/components/MetaPixel'

const inputClass =
  'w-full bg-asphalt-dark border border-white/15 text-grid-white telemetry-text px-4 py-3 focus:border-telemetry-cyan focus:outline-none placeholder:text-pit-gray/60'
const labelClass = 'block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2'

export default function ContactClient() {
  const [reason, setReason] = useState<ContactReason>('birthday')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [groupSize, setGroupSize] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot

  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const showEventFields = EVENT_REASONS.has(reason)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('sending')
    setError(null)
    // One id shared between the Pixel Lead (below) and the CAPI Lead (server),
    // so Meta dedupes the pair into a single, well-matched conversion.
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `lead_${Date.now()}_${Math.round(Math.random() * 1e9)}`
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          name,
          email,
          phone,
          preferredDate: showEventFields ? preferredDate : '',
          groupSize: showEventFields ? groupSize : '',
          message,
          company,
          eventId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong.')
      // Fire the browser-side Lead with the same id (deduped against CAPI).
      metaTrack('Lead', { content_category: 'contact' }, eventId)
      setStatus('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-8 text-center">
        <h2 className="racing-headline text-2xl text-grid-white mb-3">
          Message <span className="text-telemetry-cyan">Sent</span>
        </h2>
        <p className="telemetry-text text-pit-gray mb-6">
          Thanks, {name.split(' ')[0] || 'racer'} — we&apos;ll get back to you shortly. For anything urgent,
          call us at{' '}
          <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">
            (808) 220-2600
          </a>
          .
        </p>
        <Button href="/" size="lg">
          Back to Home
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-asphalt-dark border border-white/10 p-6 sm:p-8 space-y-5">
      {/* Honeypot — visually hidden, off-screen, not tabbable. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      <div>
        <label className={labelClass}>What&apos;s this about?</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as ContactReason)} className={inputClass}>
          {CONTACT_REASONS.map((r) => (
            <option key={r} value={r}>
              {CONTACT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Name *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" />
        </div>
        <div>
          <label className={labelClass}>Email *</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@email.com" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={labelClass}>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="(optional)" />
        </div>
        {showEventFields && (
          <div>
            <label className={labelClass}>Group size</label>
            <input
              type="number"
              min="1"
              value={groupSize}
              onChange={(e) => setGroupSize(e.target.value)}
              className={inputClass}
              placeholder="How many people?"
            />
          </div>
        )}
      </div>

      {showEventFields && (
        <div>
          <label className={labelClass}>Preferred date</label>
          <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className={inputClass} />
        </div>
      )}

      <div>
        <label className={labelClass}>Message *</label>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClass}
          placeholder="Tell us what you're planning and we'll take care of the rest."
        />
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full px-8 py-4 bg-apex-red text-white racing-headline text-lg hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'Sending…' : 'Send Message'}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center">
        Prefer to talk? Call{' '}
        <a href="tel:+18082202600" className="text-telemetry-cyan hover:underline">
          (808) 220-2600
        </a>
      </p>
    </form>
  )
}
