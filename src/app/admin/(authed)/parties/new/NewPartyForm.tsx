'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PARTY_TYPES, PARTY_TYPE_LABELS, type PartyType } from '@/lib/parties-shared'

function buildTimeOptions(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const push = (h: number, m: number) => {
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const period = h >= 12 ? 'PM' : 'AM'
    const dh = h % 12 || 12
    out.push({ value, label: `${dh}:${String(m).padStart(2, '0')} ${period}` })
  }
  for (let h = 12; h <= 23; h++) {
    push(h, 0)
    push(h, 30)
  }
  for (const h of [0, 1]) {
    push(h, 0)
    push(h, 30)
  }
  return out
}
const TIME_OPTIONS = buildTimeOptions()

const inputClass = 'composer-input'
const labelClass = 'block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5'

export default function NewPartyForm() {
  const [partyType, setPartyType] = useState<PartyType>('birthday')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [sessionDate, setSessionDate] = useState('')
  const [startTime, setStartTime] = useState('12:00')
  const [headcount, setHeadcount] = useState('')
  const [totalPrice, setTotalPrice] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ partyId: string; payUrl: string; depositCents: number } | null>(null)

  const totalNum = Number(totalPrice)
  const depositPreview = Number.isFinite(totalNum) && totalNum > 0 ? totalNum / 2 : 0

  async function submit() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/parties/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyType,
          contactName,
          contactEmail,
          contactPhone,
          sessionDate,
          startTime,
          headcount,
          totalPrice,
          notes,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create party invite')
      setResult({ partyId: data.partyId, payUrl: data.payUrl, depositCents: data.depositCents })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create party invite')
    } finally {
      setSaving(false)
    }
  }

  if (result) {
    return (
      <div className="bg-asphalt-dark border border-green-500/30 p-6 space-y-4">
        <h2 className="racing-headline text-xl text-grid-white">
          Invite <span className="text-green-400">Created</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray">
          Party <span className="text-grid-white">{result.partyId}</span> created and the deposit link was emailed to{' '}
          <span className="text-grid-white">{contactEmail}</span>. It confirms once they pay the{' '}
          ${(result.depositCents / 100).toFixed(2)} deposit.
        </p>
        <div>
          <label className={labelClass}>Deposit link (to share directly)</label>
          <input readOnly value={result.payUrl} className={inputClass} onFocus={(e) => e.target.select()} />
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/parties"
            className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-6 py-3 transition-colors"
          >
            View all parties
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null)
              setContactName('')
              setContactEmail('')
              setContactPhone('')
              setHeadcount('')
              setTotalPrice('')
              setNotes('')
            }}
            className="telemetry-text text-sm uppercase tracking-wider border border-white/20 text-grid-white px-6 py-3 hover:border-white/40 transition-colors"
          >
            New party
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Party type</label>
          <select value={partyType} onChange={(e) => setPartyType(e.target.value as PartyType)} className={inputClass}>
            {PARTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PARTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Guests</label>
          <input type="number" min="1" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className={inputClass} placeholder="e.g. 12" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Contact name</label>
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contact email</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputClass} placeholder="they get the pay link here" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Phone</label>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} placeholder="(optional)" />
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Start time</label>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass}>
            {TIME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label className={labelClass}>Total quote ($)</label>
          <input type="number" min="0" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} className={inputClass} placeholder="e.g. 450.00" />
        </div>
        <div className="bg-telemetry-cyan/5 border border-telemetry-cyan/20 px-4 py-3">
          <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">Deposit due online (50%)</p>
          <p className="racing-headline text-2xl text-telemetry-cyan">${depositPreview.toFixed(2)}</p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes (internal)</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
      >
        {saving ? 'Creating…' : 'Create invite & email deposit link'}
      </button>
    </div>
  )
}
