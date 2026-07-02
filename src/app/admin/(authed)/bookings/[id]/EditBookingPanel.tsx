'use client'

// Inline "edit booking details" panel for the admin detail page. All money is
// recomputed server-side by /api/admin/bookings/[id] (PATCH) — this form just
// collects the new values and previews the auto price. Follows the NoShowDialog
// pattern: local state, fetch, then router.refresh() to re-render the server page.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculatePrice } from '@/lib/pricing'

interface Props {
  bookingId: string
  sessionDate: string // "YYYY-MM-DD"
  startTime: string // "HH:MM[:SS]"
  durationHours: number
  racerCount: number
  sessionPriceCents: number
  priceOverridden: boolean
  notes: string | null
  discountCode: string | null
}

// 30-minute slots, noon → 1:30am, matching the booking form's operating hours.
function buildTimeSlots(): Array<{ value: string; label: string }> {
  const slots: Array<{ value: string; label: string }> = []
  const push = (h: number, m: number) => {
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const period = h >= 12 ? 'PM' : 'AM'
    const displayH = h % 12 || 12
    slots.push({ value, label: `${displayH}:${String(m).padStart(2, '0')} ${period}` })
  }
  for (let h = 12; h <= 23; h++) {
    push(h, 0)
    push(h, 30)
  }
  for (const h of [0, 1]) {
    push(h, 0)
    push(h, 30)
  }
  return slots
}

const TIME_SLOTS = buildTimeSlots()

function toHHMM(t: string): string {
  const [h = '00', m = '00'] = t.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

export default function EditBookingPanel(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const [sessionDate, setSessionDate] = useState(props.sessionDate)
  const [startTime, setStartTime] = useState(toHHMM(props.startTime))
  const [durationHours, setDurationHours] = useState<1 | 2 | 3>(
    props.durationHours as 1 | 2 | 3
  )
  const [racerCount, setRacerCount] = useState<1 | 2 | 3>(props.racerCount as 1 | 2 | 3)
  const [notes, setNotes] = useState(props.notes ?? '')

  // Auto price for the currently-selected params (dollars from the matrix).
  const autoPriceCents = calculatePrice(sessionDate, durationHours, racerCount).price * 100
  // Start in override mode iff the booking's price was set manually (the server
  // tracks this authoritatively via the price_overridden flag).
  const [override, setOverride] = useState(props.priceOverridden)
  const [priceInput, setPriceInput] = useState(dollars(props.sessionPriceCents))

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  async function save() {
    setSaving(true)
    setError(null)
    setWarnings([])
    try {
      const body: Record<string, unknown> = {
        sessionDate,
        startTime,
        durationHours,
        racerCount,
        notes: notes.trim() ? notes : null,
        priceOverrideCents: override ? Math.round(Number(priceInput) * 100) : null,
      }
      const res = await fetch(`/api/admin/bookings/${props.bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Edit failed')
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        // Surface warnings but still refresh — the edit succeeded.
        setWarnings(data.warnings)
      }
      router.refresh()
      if (!data.warnings || data.warnings.length === 0) setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Edit failed')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="telemetry-text text-xs uppercase tracking-wider border border-white/20 text-grid-white px-4 py-2 hover:border-telemetry-cyan hover:text-telemetry-cyan transition-colors"
      >
        Edit details
      </button>
    )
  }

  return (
    <div className="bg-asphalt-dark border border-telemetry-cyan/30 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="racing-headline text-lg text-grid-white">Edit booking</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Date</label>
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="composer-input"
          />
        </div>
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Start time</label>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="composer-input">
            {/* Ensure the stored time is selectable even if off the 30-min grid. */}
            {!TIME_SLOTS.some((s) => s.value === startTime) && (
              <option value={startTime}>{startTime}</option>
            )}
            {TIME_SLOTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Duration</label>
          <select
            value={durationHours}
            onChange={(e) => setDurationHours(Number(e.target.value) as 1 | 2 | 3)}
            className="composer-input"
          >
            <option value={1}>1 hour</option>
            <option value={2}>2 hours</option>
            <option value={3}>3 hours</option>
          </select>
        </div>
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Racers</label>
          <select
            value={racerCount}
            onChange={(e) => setRacerCount(Number(e.target.value) as 1 | 2 | 3)}
            className="composer-input"
          >
            <option value={1}>1 racer</option>
            <option value={2}>2 racers</option>
            <option value={3}>3 racers</option>
          </select>
        </div>
      </div>

      {/* Price */}
      <div className="border-t border-white/10 pt-4">
        <label className="flex items-center gap-2 telemetry-text text-sm text-grid-white cursor-pointer">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          Override price manually
        </label>
        {override ? (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <span className="telemetry-text text-grid-white">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className="composer-input max-w-[140px]"
              />
            </div>
            <p className="telemetry-text text-xs text-pit-gray mt-1">
              Auto price for these settings would be ${dollars(autoPriceCents)}.
            </p>
          </div>
        ) : (
          <p className="telemetry-text text-sm text-telemetry-cyan mt-2">
            Session price: ${dollars(autoPriceCents)} <span className="text-pit-gray">(auto)</span>
          </p>
        )}
        {props.discountCode && (
          <p className="telemetry-text text-xs text-pit-gray mt-2">
            Discount code <span className="text-grid-white">{props.discountCode}</span> is applied — the amount is
            recalculated against the new price automatically.
          </p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="composer-input"
          placeholder="Internal staff notes"
        />
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
          <p className="telemetry-text text-xs text-amber-400 uppercase tracking-wider">Saved with warnings</p>
          {warnings.map((w, i) => (
            <p key={i} className="telemetry-text text-sm text-amber-300">
              • {w}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
