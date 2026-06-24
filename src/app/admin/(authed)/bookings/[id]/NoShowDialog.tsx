'use client'

// Admin no-show action UI. Renders a card with one checkbox per racer:
//   - unchecked = showed up
//   - checked = no-show
// Live-updates the displayed charge amount as boxes are toggled, then
// POSTs to /api/admin/bookings/[id]/no-show on commit.
//
// Two modes:
//   - All checkboxes unchecked → "Mark Complete (no charges)" — confirms
//     everyone showed up, marks booking 'completed', no card charged.
//   - At least one checked → "Charge $X No-Show Fee" — fires the off-session
//     PaymentIntent for $20 × no_show_count.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Racer {
  slot: number
  name: string
  showedUp: boolean | null
}

interface NoShowDialogProps {
  bookingId: string
  racers: Racer[]
  noShowFeePerSeatCents: number
  hasCardOnFile: boolean
}

export default function NoShowDialog({
  bookingId,
  racers,
  noShowFeePerSeatCents,
  hasCardOnFile,
}: NoShowDialogProps) {
  const router = useRouter()
  // Local state: which slots are checked as no-show.
  // Initialize from server data (showedUp === false → checked).
  const [noShowSlots, setNoShowSlots] = useState<Set<number>>(
    () => new Set(racers.filter((r) => r.showedUp === false).map((r) => r.slot))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    success: boolean
    note?: string
    charge?: {
      status: string
      amountCents: number
      declineCode?: string | null
      failureMessage?: string | null
    } | null
  } | null>(null)

  const noShowCount = noShowSlots.size
  const chargeAmountCents = noShowCount * noShowFeePerSeatCents

  const toggleSlot = (slot: number) => {
    setNoShowSlots((prev) => {
      const next = new Set(prev)
      if (next.has(slot)) next.delete(slot)
      else next.add(slot)
      return next
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}/no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noShowSlots: Array.from(noShowSlots) }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        setError(data.error ?? 'Unknown error')
        setResult(data)
      } else {
        setResult(data)
        // Refresh server data so the page reflects the new status + charge
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const buttonLabel =
    noShowCount === 0
      ? 'Mark Session Complete (no charges)'
      : `Charge $${(chargeAmountCents / 100).toFixed(0)} No-Show Fee${noShowCount > 1 ? `s` : ''}`

  const buttonDisabled = submitting || (noShowCount > 0 && !hasCardOnFile)

  return (
    <div className="bg-asphalt-dark border-2 border-apex-red/40 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="racing-headline text-xl text-grid-white">
            Settle the <span className="text-apex-red">Session</span>
          </h2>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Check the box for any racer who didn&apos;t show up.
            Each no-show is a ${(noShowFeePerSeatCents / 100).toFixed(0)} charge
            to the card on file.
          </p>
        </div>
      </div>

      {/* Per-racer checkboxes */}
      <div className="space-y-2 mb-6">
        {racers.map((r) => {
          const isNoShow = noShowSlots.has(r.slot)
          return (
            <label
              key={r.slot}
              className={`flex items-center gap-3 p-3 border cursor-pointer transition-colors ${
                isNoShow
                  ? 'border-apex-red/50 bg-apex-red/10'
                  : 'border-white/10 hover:border-white/30 bg-asphalt'
              }`}
            >
              <input
                type="checkbox"
                checked={isNoShow}
                onChange={() => toggleSlot(r.slot)}
                disabled={submitting}
                className="w-5 h-5 accent-apex-red"
              />
              <span className="w-8 h-8 flex items-center justify-center bg-telemetry-cyan/20 text-telemetry-cyan racing-headline shrink-0">
                {r.slot}
              </span>
              <span className="telemetry-text text-grid-white flex-1">{r.name}</span>
              <span
                className={`telemetry-text text-xs uppercase tracking-wider ${
                  isNoShow ? 'text-apex-red' : 'text-pit-gray'
                }`}
              >
                {isNoShow ? 'No-show' : 'Showed up'}
              </span>
            </label>
          )
        })}
      </div>

      {/* Charge preview */}
      <div className="bg-asphalt border border-white/10 p-4 mb-4">
        <div className="flex justify-between items-center">
          <span className="telemetry-text text-sm text-pit-gray">
            {noShowCount === 0
              ? 'Everyone showed up'
              : `${noShowCount} no-show${noShowCount > 1 ? 's' : ''}`}
          </span>
          <span className="racing-headline text-2xl text-grid-white">
            ${(chargeAmountCents / 100).toFixed(2)}
          </span>
        </div>
        {noShowCount > 0 && !hasCardOnFile && (
          <p className="telemetry-text text-xs text-amber-400 mt-2">
            ⚠ No card on file — collect ${(chargeAmountCents / 100).toFixed(0)} in person.
          </p>
        )}
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={buttonDisabled}
        className="w-full px-6 py-3 bg-apex-red text-white racing-headline text-lg hover:bg-apex-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
            Processing...
          </>
        ) : (
          buttonLabel
        )}
      </button>

      {/* Result feedback */}
      {error && (
        <div className="mt-4 p-4 bg-apex-red/10 border border-apex-red">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}
      {result?.success && result.charge && (
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30">
          <p className="telemetry-text text-sm text-green-400">
            ✓ Charged ${(result.charge.amountCents / 100).toFixed(2)} successfully.
          </p>
        </div>
      )}
      {result?.success && !result.charge && (
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30">
          <p className="telemetry-text text-sm text-green-400">
            ✓ Booking marked complete. No charges.
          </p>
        </div>
      )}
      {result?.note && (
        <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30">
          <p className="telemetry-text text-xs text-amber-400">{result.note}</p>
        </div>
      )}
      {result && !result.success && result.charge && (
        <div className="mt-4 p-4 bg-apex-red/10 border border-apex-red">
          <p className="telemetry-text text-sm text-apex-red">
            Charge failed
            {result.charge.declineCode ? ` [${result.charge.declineCode}]` : ''}:{' '}
            {result.charge.failureMessage}
          </p>
          <p className="telemetry-text text-xs text-pit-gray mt-1">
            You can retry from the Charge History below, or collect in person.
          </p>
        </div>
      )}
    </div>
  )
}
