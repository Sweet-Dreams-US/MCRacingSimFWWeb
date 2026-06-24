'use client'

// Triggers a recalculation of the marketing payout for a specific period.
// Defaults to "current month" if year/month aren't provided — the server
// resolves the Eastern-time current month in that case.
//
// On success we call router.refresh() so the server component re-renders with
// the updated calculation row. We don't need any client state for the payload
// itself — the server is the source of truth.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface RecalculateButtonProps {
  // Optional explicit period. Omit to recalc the current Eastern month.
  year?: number
  month?: number
  // Visual variant — primary for the headline CTA, secondary for inline use.
  variant?: 'primary' | 'secondary'
  // Custom label override. Defaults to "Recalculate Now".
  label?: string
}

export default function RecalculateButton({
  year,
  month,
  variant = 'primary',
  label = 'Recalculate Now',
}: RecalculateButtonProps) {
  const router = useRouter()
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // useTransition lets router.refresh() run as a non-blocking transition so
  // the button can return to its idle state without flashing through a
  // stale "done" frame.
  const [isPending, startTransition] = useTransition()

  const busy = isPosting || isPending

  async function handleClick() {
    setIsPosting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/payouts/marketing/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          year !== undefined && month !== undefined ? { year, month } : {}
        ),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? `Request failed (${res.status})`)
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recalculation failed')
    } finally {
      setIsPosting(false)
    }
  }

  const baseClasses =
    'inline-flex items-center justify-center gap-2 px-6 py-3 racing-headline text-sm uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
  const variantClasses =
    variant === 'primary'
      ? 'bg-apex-red text-white hover:bg-apex-red-glow hover:shadow-lg hover:shadow-apex-red/30'
      : 'border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10'

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`${baseClasses} ${variantClasses}`}
      >
        {busy ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
            />
            Calculating…
          </>
        ) : (
          label
        )}
      </button>
      {error && (
        <p
          role="alert"
          className="telemetry-text text-xs text-apex-red max-w-md"
        >
          {error}
        </p>
      )}
    </div>
  )
}
