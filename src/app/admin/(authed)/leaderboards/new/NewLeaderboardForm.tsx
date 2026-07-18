'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewLeaderboardForm() {
  const router = useRouter()
  const [trackName, setTrackName] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [makeActive, setMakeActive] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!trackName.trim()) {
      setError('Enter a track name.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/leaderboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackName: trackName.trim(),
          periodLabel: periodLabel.trim() || undefined,
          makeActive,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not create leaderboard')
      router.push(`/admin/leaderboards/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create leaderboard')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-asphalt-dark border border-white/10 p-6 space-y-5">
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Track name *
          </label>
          <input
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            placeholder="e.g. Monaco GP"
            className="composer-input"
          />
        </div>
        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Month / label <span className="text-pit-gray/60">(optional)</span>
          </label>
          <input
            value={periodLabel}
            onChange={(e) => setPeriodLabel(e.target.value)}
            placeholder="e.g. August 2026"
            className="composer-input"
          />
        </div>
        <label className="flex items-start gap-3 bg-asphalt border border-white/10 p-4 cursor-pointer">
          <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} className="mt-1" />
          <span className="telemetry-text text-sm text-grid-white">
            Make this the active board
            <span className="block text-xs text-pit-gray mt-1">
              {makeActive
                ? 'This is the one shown on the public Leaderboard page. The previous active board is archived.'
                : 'Off: it stays hidden from the public page until you activate it.'}
            </span>
          </span>
        </label>
      </div>

      {error && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
      >
        {submitting ? 'Creating…' : 'Create leaderboard →'}
      </button>
    </div>
  )
}
