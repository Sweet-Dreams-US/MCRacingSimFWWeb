'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface DiscountRow {
  id: string
  code: string
  kind: string
  percent_off: number | null
  amount_off_cents: number | null
  applies_to: string
  active: boolean
  expires_at: string | null
  max_redemptions: number | null
  redemption_count: number
  max_total_hours: number | null
  hours_redeemed: number
  source: string
  notes: string | null
  created_at: string
}

function discountLabel(d: DiscountRow): string {
  if (d.kind === 'percent') return `${d.percent_off}% off`
  return `$${((d.amount_off_cents ?? 0) / 100).toFixed(2)} off`
}

export default function DiscountManager({ initialCodes }: { initialCodes: DiscountRow[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<'percent' | 'fixed'>('percent')
  const [percent, setPercent] = useState('20')
  const [amount, setAmount] = useState('')
  const [code, setCode] = useState('')
  const [appliesTo, setAppliesTo] = useState<'session' | 'party' | 'any'>('session')
  const [expiresAt, setExpiresAt] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  async function create() {
    setError(null)
    setCreated(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim() || undefined,
          kind,
          percentOff: kind === 'percent' ? Number(percent) : undefined,
          amountOffCents: kind === 'fixed' ? Math.round(Number(amount) * 100) : undefined,
          appliesTo,
          expiresAt: expiresAt || null,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Create failed')
      setCreated(data.code)
      setCode('')
      setNotes('')
      setExpiresAt('')
      setMaxRedemptions('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/admin/discounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    })
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Create */}
      <div className="bg-asphalt-dark border border-white/10 p-6 space-y-4">
        <h2 className="racing-headline text-lg text-grid-white">New code</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'fixed')} className="composer-input">
              <option value="percent">Percent off</option>
              <option value="fixed">Dollar amount off</option>
            </select>
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              {kind === 'percent' ? 'Percent (1–100)' : 'Amount ($)'}
            </label>
            {kind === 'percent' ? (
              <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className="composer-input" />
            ) : (
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" className="composer-input" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Code <span className="text-pit-gray/60">(blank = auto)</span>
            </label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="AUTO-GENERATE" className="composer-input uppercase" />
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Applies to</label>
            <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as 'session' | 'party' | 'any')} className="composer-input">
              <option value="session">Sessions</option>
              <option value="party">Parties</option>
              <option value="any">Anything</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Expires <span className="text-pit-gray/60">(optional)</span>
            </label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="composer-input" />
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Max uses <span className="text-pit-gray/60">(optional)</span>
            </label>
            <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="Unlimited" className="composer-input" />
          </div>
        </div>

        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Notes <span className="text-pit-gray/60">(internal)</span>
          </label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="composer-input" />
        </div>

        {error && (
          <div className="bg-apex-red/10 border border-apex-red/30 p-3">
            <p className="telemetry-text text-sm text-apex-red">{error}</p>
          </div>
        )}
        {created && (
          <div className="bg-green-500/10 border border-green-500/30 p-3">
            <p className="telemetry-text text-sm text-green-400">
              Created <span className="font-bold">{created}</span> — customers can use it now.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
        >
          {saving ? 'Creating…' : 'Generate code'}
        </button>
      </div>

      {/* List */}
      <div>
        <h2 className="racing-headline text-lg text-grid-white mb-3">All codes</h2>
        {initialCodes.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">No codes yet.</p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/5">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr className="text-left">
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Code</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Discount</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">For</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">Used</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {initialCodes.map((d) => (
                  <tr key={d.id} className="border-b border-white/5 last:border-b-0">
                    <td className="p-3 telemetry-text text-grid-white font-bold">{d.code}</td>
                    <td className="p-3 telemetry-text text-sm text-grid-white">{discountLabel(d)}</td>
                    <td className="p-3 telemetry-text text-xs text-pit-gray uppercase">{d.applies_to}</td>
                    <td className="p-3 telemetry-text text-sm text-grid-white text-right">
                      {d.redemption_count}
                      {d.max_redemptions != null ? ` / ${d.max_redemptions}` : ''}
                    </td>
                    <td className="p-3">
                      {d.active ? (
                        <span className="telemetry-text text-xs px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/30 uppercase">Active</span>
                      ) : (
                        <span className="telemetry-text text-xs px-2 py-1 bg-white/5 text-pit-gray border border-white/10 uppercase">Off</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggle(d.id, !d.active)}
                        className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase"
                      >
                        {d.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
