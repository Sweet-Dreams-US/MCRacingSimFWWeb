'use client'

// Draft actions: send yourself a test, blast the whole audience, or delete.
// The blast is guarded by an explicit typed confirmation because it's
// irreversible and outward-facing.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DraftSendPanel({
  campaignId,
  audienceCount,
}: {
  campaignId: string
  audienceCount: number
}) {
  const router = useRouter()
  const [testEmail, setTestEmail] = useState('')
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState<string | null>(null)

  const [confirming, setConfirming] = useState(false)
  const [blasting, setBlasting] = useState(false)
  const [blastErr, setBlastErr] = useState<string | null>(null)

  async function sendTest() {
    setTestState('sending')
    setTestMsg(null)
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Send failed')
      setTestState('sent')
      setTestMsg(`Test sent to ${testEmail.trim()} — check your inbox (and spam folder).`)
    } catch (err) {
      setTestState('error')
      setTestMsg(err instanceof Error ? err.message : 'Send failed')
    }
  }

  async function blast() {
    setBlasting(true)
    setBlastErr(null)
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}/send`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Send failed')
      // Status flips to "sending"; refresh swaps this panel for the live stats.
      router.refresh()
    } catch (err) {
      setBlastErr(err instanceof Error ? err.message : 'Send failed')
      setBlasting(false)
      setConfirming(false)
    }
  }

  async function remove() {
    if (!confirm('Delete this draft campaign? This cannot be undone.')) return
    const res = await fetch(`/api/admin/marketing/campaigns/${campaignId}`, {
      method: 'DELETE',
    })
    const data = await res.json()
    if (res.ok && data.success) {
      router.push('/admin/marketing')
    } else {
      alert(data.error || 'Delete failed')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Test send */}
      <div className="bg-asphalt-dark border border-white/5 p-5">
        <h3 className="racing-headline text-base text-grid-white mb-1">
          1. Send a test first
        </h3>
        <p className="telemetry-text text-xs text-pit-gray mb-3">
          Always preview a real send in your own inbox before blasting the list.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="composer-input flex-1 min-w-[200px]"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={testState === 'sending' || !testEmail.includes('@')}
            className="telemetry-text text-sm uppercase tracking-wider bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/40 hover:bg-telemetry-cyan/25 disabled:opacity-40 px-4 py-2.5 transition-colors"
          >
            {testState === 'sending' ? 'Sending…' : 'Send Test'}
          </button>
        </div>
        {testMsg && (
          <p
            className={`telemetry-text text-xs mt-2 ${
              testState === 'error' ? 'text-apex-red' : 'text-green-400'
            }`}
          >
            {testMsg}
          </p>
        )}
      </div>

      {/* Blast */}
      <div className="bg-asphalt-dark border border-apex-red/20 p-5">
        <h3 className="racing-headline text-base text-grid-white mb-1">
          2. Send to everyone
        </h3>
        <p className="telemetry-text text-xs text-pit-gray mb-3">
          Goes to{' '}
          <span className="text-grid-white font-bold">{audienceCount}</span>{' '}
          {audienceCount === 1 ? 'inbox' : 'inboxes'}. Unsubscribed, bounced, and
          spam-flagged customers are automatically excluded.
        </p>

        {blastErr && (
          <div className="bg-apex-red/10 border border-apex-red/30 p-3 mb-3">
            <p className="telemetry-text text-sm text-apex-red">{blastErr}</p>
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={audienceCount === 0}
            className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-40 text-grid-white px-6 py-3 transition-colors"
          >
            Send Campaign →
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="telemetry-text text-sm text-grid-white">
              Send to {audienceCount} now?
            </span>
            <button
              type="button"
              onClick={blast}
              disabled={blasting}
              className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-5 py-2.5 transition-colors"
            >
              {blasting ? 'Starting…' : 'Yes, send it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={blasting}
              className="telemetry-text text-sm text-pit-gray hover:text-grid-white px-3 py-2.5"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Delete */}
      <div>
        <button
          type="button"
          onClick={remove}
          className="telemetry-text text-xs text-pit-gray hover:text-apex-red transition-colors"
        >
          Delete this draft
        </button>
      </div>
    </div>
  )
}
