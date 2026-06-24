'use client'

// Marks a marketing payout calculation row as paid, which on the server side
// inserts a marketing_payout transaction (negative amount) and links it back
// to the calculation. Owner-only — non-owner clicks will get a 403 from the
// API and we'll surface that error in-line.
//
// Confirms before posting because this writes to the ledger and isn't trivially
// undoable from the UI. A second click pattern would be more polished but this
// is admin-only and infrequent — a simple confirm() is fine.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface MarkPaidButtonProps {
  calculationId: string
  // Human-readable period label like "June 2026" — used in the confirm prompt.
  periodLabel: string
  // Formatted payout amount like "$1,815.00" — used in the confirm prompt.
  payoutLabel: string
  // Visual variant. The history table uses 'compact' to fit inline.
  variant?: 'primary' | 'compact'
}

export default function MarkPaidButton({
  calculationId,
  periodLabel,
  payoutLabel,
  variant = 'primary',
}: MarkPaidButtonProps) {
  const router = useRouter()
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const busy = isPosting || isPending

  async function handleClick() {
    // Single confirm — this is the trust boundary.
    const ok = window.confirm(
      `Mark the ${periodLabel} marketing payout of ${payoutLabel} as paid?\n\n` +
        `This will create a marketing_payout transaction in the ledger.`
    )
    if (!ok) return

    setIsPosting(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/payouts/marketing/${calculationId}/mark-paid`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? `Request failed (${res.status})`)
      }
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark paid')
    } finally {
      setIsPosting(false)
    }
  }

  const baseClasses =
    'inline-flex items-center justify-center gap-2 racing-headline uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
  const variantClasses =
    variant === 'primary'
      ? 'px-6 py-3 text-sm bg-telemetry-cyan text-asphalt-dark hover:bg-telemetry-cyan-glow hover:shadow-lg hover:shadow-telemetry-cyan/30'
      : 'px-3 py-1.5 text-xs border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10'

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
              className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
            />
            Recording…
          </>
        ) : (
          'Mark as Paid'
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
