'use client'

// Small inline retry button for a failed charge row. Hits the retry
// endpoint and refreshes the page on success/failure so the new
// charge row appears in the history.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ChargeRetryButtonProps {
  bookingId: string
  chargeId: string
}

export default function ChargeRetryButton({
  bookingId,
  chargeId,
}: ChargeRetryButtonProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRetry = async () => {
    if (
      !confirm('Retry this charge against the card on file?')
    ) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/bookings/${bookingId}/charges/${chargeId}/retry`,
        { method: 'POST' }
      )
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? 'Retry failed')
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRetry}
        disabled={submitting}
        className="telemetry-text text-xs px-3 py-1 border border-apex-red/50 text-apex-red hover:bg-apex-red/10 transition-colors disabled:opacity-50 uppercase tracking-wider"
      >
        {submitting ? 'Retrying...' : 'Retry'}
      </button>
      {error && (
        <p className="telemetry-text text-xs text-apex-red text-right max-w-[180px]">
          {error}
        </p>
      )}
    </div>
  )
}
