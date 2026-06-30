'use client'

// Send one personalized marketing email to this customer, from their detail
// page. Collapsed by default. Honors suppression server-side; we also reflect
// it here so the owner isn't surprised.
import { useState } from 'react'

interface Props {
  customerId: string
  firstName: string
  emailable: boolean
  suppressionReason?: string | null
}

export default function SendEmailToCustomer({
  customerId,
  firstName,
  emailable,
  suppressionReason,
}: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [msg, setMsg] = useState<string | null>(null)

  if (!emailable) {
    return (
      <div className="bg-asphalt-dark border border-white/5 p-6">
        <h2 className="racing-headline text-lg text-grid-white mb-2">Send email</h2>
        <p className="telemetry-text text-sm text-pit-gray">
          {suppressionReason ?? 'This customer can’t be emailed right now.'}
        </p>
      </div>
    )
  }

  async function send() {
    setState('sending')
    setMsg(null)
    try {
      const res = await fetch('/api/admin/marketing/send-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          subject: subject.trim(),
          message: message.trim(),
          ctaLabel: ctaLabel.trim() || null,
          ctaUrl: ctaUrl.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Send failed')
      setState('sent')
      setMsg('Sent ✓')
      setSubject('')
      setMessage('')
      setCtaLabel('')
      setCtaUrl('')
    } catch (err) {
      setState('error')
      setMsg(err instanceof Error ? err.message : 'Send failed')
    }
  }

  return (
    <div className="bg-asphalt-dark border border-white/5 p-6">
      <div className="flex items-center justify-between">
        <h2 className="racing-headline text-lg text-grid-white">Send email</h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="telemetry-text text-xs uppercase tracking-wider bg-apex-red/15 text-apex-red border border-apex-red/40 hover:bg-apex-red/25 px-3 py-1.5 transition-colors"
          >
            ✉ Compose
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="telemetry-text text-xs text-pit-gray">
            Personal one-off to {firstName}. Tip: type{' '}
            <code className="text-telemetry-cyan">{'{{firstName}}'}</code> to
            insert their name.
          </p>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="composer-input"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={`Hi ${firstName},\n\n…`}
            className="composer-input resize-y"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Button text (optional)"
              className="composer-input"
            />
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://… (optional)"
              className="composer-input"
            />
          </div>
          {msg && (
            <p
              className={`telemetry-text text-xs ${
                state === 'error' ? 'text-apex-red' : 'text-green-400'
              }`}
            >
              {msg}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={state === 'sending' || !subject.trim() || !message.trim()}
              className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-40 text-grid-white px-5 py-2.5 transition-colors"
            >
              {state === 'sending' ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="telemetry-text text-sm text-pit-gray hover:text-grid-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
