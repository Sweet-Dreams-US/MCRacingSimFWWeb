'use client'

// Shown on a sent (or failed) campaign when some recipients didn't get it —
// failed sends, a blast that died partway, or people added since. Fires the
// resend route, which only mails those who still need it. Safe to click again.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResendPanel({
  campaignId,
  resendableCount,
}: {
  campaignId: string
  resendableCount: number
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function resend() {
    setSending(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}/resend`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Resend failed')
      router.refresh() // flips to 'sending' → live poller takes over
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Resend failed')
      setSending(false)
    }
  }

  if (resendableCount <= 0) {
    return (
      <div className="bg-asphalt-dark border border-white/5 p-5 max-w-2xl">
        <p className="telemetry-text text-sm text-green-400">
          ✓ Everyone on the current list received this campaign.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-asphalt-dark border border-apex-red/20 p-5 max-w-2xl">
      <h3 className="racing-headline text-base text-grid-white mb-1">
        {resendableCount} didn&apos;t receive it
      </h3>
      <p className="telemetry-text text-xs text-pit-gray mb-3">
        Some sends failed or never went out. Resend to just those{' '}
        <span className="text-grid-white font-bold">{resendableCount}</span>{' '}
        {resendableCount === 1 ? 'inbox' : 'inboxes'} — anyone who already got it
        is skipped, so no one is emailed twice.
      </p>

      {err && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3 mb-3">
          <p className="telemetry-text text-sm text-apex-red">{err}</p>
        </div>
      )}

      <button
        type="button"
        onClick={resend}
        disabled={sending}
        className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
      >
        {sending ? 'Starting…' : `Resend to ${resendableCount} →`}
      </button>
    </div>
  )
}
