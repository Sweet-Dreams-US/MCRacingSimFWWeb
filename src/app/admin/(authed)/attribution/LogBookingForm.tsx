'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ATTRIBUTION_SOURCES } from '@/lib/attribution'

interface CustomerHit {
  id: string
  name: string
  email: string | null
}

export default function LogBookingForm() {
  const router = useRouter()
  const [channel, setChannel] = useState<'phone' | 'in_person'>('phone')
  const [when, setWhen] = useState('')
  const [racers, setRacers] = useState('')
  const [hours, setHours] = useState('')
  const [amount, setAmount] = useState('')
  const [deposit, setDeposit] = useState('')
  const [isMembership, setIsMembership] = useState(false)
  const [attributedSource, setAttributedSource] = useState('')
  const [notes, setNotes] = useState('')

  // Optional customer link (backfills attributed_source when set).
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CustomerHit[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')

  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (customerId || query.trim().length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setHits(data.customers ?? [])
      } catch {
        setHits([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, customerId])

  async function submit() {
    setMsg(null)
    if (!amount.trim() || !Number.isFinite(Number(amount))) {
      setMsg({ ok: false, text: 'Enter the amount (in dollars).' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mc-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          bookingDatetime: when ? new Date(when).toISOString() : null,
          racers: racers || null,
          durationHours: hours || null,
          amount,
          depositPaid: deposit || null,
          isMembership,
          customerId,
          attributedSource: attributedSource || null,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not log the booking')
      setMsg({ ok: true, text: 'Logged. It’s now in the revenue-by-source totals above.' })
      // Reset the money-ish fields; keep channel for fast repeat entry.
      setWhen('')
      setRacers('')
      setHours('')
      setAmount('')
      setDeposit('')
      setIsMembership(false)
      setAttributedSource('')
      setNotes('')
      setCustomerId(null)
      setCustomerName('')
      setQuery('')
      router.refresh()
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not log the booking' })
    } finally {
      setSaving(false)
    }
  }

  const label = 'block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5'

  return (
    <section className="bg-asphalt-dark border border-white/10 p-6 space-y-4">
      <div>
        <h2 className="racing-headline text-lg text-grid-white">Log a phone / walk-in booking</h2>
        <p className="telemetry-text text-xs text-pit-gray mt-1">
          Adds a row to the unified ledger so all revenue shows in the totals above. Online bookings
          are logged automatically — use this only for phone &amp; walk-in.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Channel</label>
          <div className="flex gap-2">
            {(['phone', 'in_person'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`flex-1 telemetry-text text-sm py-2 border ${
                  channel === c
                    ? 'bg-apex-red text-grid-white border-apex-red'
                    : 'bg-transparent text-pit-gray border-white/15 hover:border-white/40'
                }`}
              >
                {c === 'phone' ? 'Phone' : 'Walk-in'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label}>Session date &amp; time</label>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="composer-input" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className={label}>Racers</label>
          <input type="number" min="0" value={racers} onChange={(e) => setRacers(e.target.value)} className="composer-input" />
        </div>
        <div>
          <label className={label}>Hours</label>
          <input type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="composer-input" />
        </div>
        <div>
          <label className={label}>Amount ($) *</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 90.00" className="composer-input" />
        </div>
        <div>
          <label className={label}>Deposit ($)</label>
          <input type="number" min="0" step="0.01" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="composer-input" />
        </div>
      </div>

      {/* Attribution: link a customer (backfills source) OR set it directly */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>Link customer <span className="text-pit-gray/60">(optional)</span></label>
          {customerId ? (
            <div className="flex items-center gap-2">
              <span className="telemetry-text text-sm text-telemetry-cyan flex-1 truncate">{customerName}</span>
              <button
                type="button"
                onClick={() => { setCustomerId(null); setCustomerName(''); setQuery('') }}
                className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className="composer-input" />
              {hits.length > 0 && (
                <div className="mt-1 border border-white/10 divide-y divide-white/5">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => { setCustomerId(h.id); setCustomerName(h.name); setQuery(''); setHits([]) }}
                      className="block w-full text-left px-3 py-2 telemetry-text text-sm text-telemetry-cyan hover:bg-white/5"
                    >
                      {h.name}{h.email ? <span className="text-pit-gray"> · {h.email}</span> : null}
                    </button>
                  ))}
                </div>
              )}
              <p className="telemetry-text text-[11px] text-pit-gray mt-1">Backfills source from the customer.</p>
            </>
          )}
        </div>
        <div>
          <label className={label}>
            How they heard {customerId ? <span className="text-pit-gray/60">(overrides customer)</span> : ''}
          </label>
          <select value={attributedSource} onChange={(e) => setAttributedSource(e.target.value)} className="composer-input">
            <option value="">{customerId ? 'Use customer’s source' : 'Not specified'}</option>
            {ATTRIBUTION_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={isMembership} onChange={(e) => setIsMembership(e.target.checked)} />
        <span className="telemetry-text text-sm text-grid-white">Membership booking</span>
      </label>

      <div>
        <label className={label}>Notes <span className="text-pit-gray/60">(optional)</span></label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="composer-input" />
      </div>

      {msg && (
        <p className={`telemetry-text text-sm ${msg.ok ? 'text-green-400' : 'text-apex-red'}`}>{msg.text}</p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
      >
        {saving ? 'Logging…' : 'Log booking'}
      </button>
    </section>
  )
}
