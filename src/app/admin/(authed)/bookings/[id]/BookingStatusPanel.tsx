'use client'

// Cancel a booking, or reopen one closed out by mistake.
//
// Reopen is the important half: the reader hides its Cancel button the moment a
// booking is marked complete and tells staff to use the admin site, which had
// no such control — so one mis-tap left a booking stuck with no way back.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Action = 'cancel' | 'reopen'

const CLOSED_OUT = ['completed', 'noshow', 'partial_noshow']

export default function BookingStatusPanel({
  bookingId,
  status,
}: {
  bookingId: string
  status: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // Set when the server reports money attached; re-sending with the
  // acknowledgement is the operator explicitly accepting that.
  const [confirmPaid, setConfirmPaid] = useState<{ action: Action; text: string } | null>(null)

  const canCancel = status !== 'cancelled'
  const canReopen = CLOSED_OUT.includes(status) || status === 'cancelled'

  async function run(action: Action, acknowledgePaid = false) {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, acknowledgePaid }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data.needsAcknowledge) {
          setConfirmPaid({ action, text: data.error })
          return
        }
        throw new Error(data.error || 'Status change failed')
      }
      setConfirmPaid(null)
      setMsg(action === 'cancel' ? 'Booking cancelled.' : 'Booking reopened.')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Status change failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-asphalt-dark border border-white/5 p-5 space-y-4">
      <h2 className="racing-headline text-sm text-grid-white uppercase tracking-wider">
        Booking status
      </h2>

      {err && (
        <div className="bg-apex-red/10 border border-apex-red/30 p-3">
          <p className="telemetry-text text-sm text-apex-red">{err}</p>
        </div>
      )}
      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 p-3">
          <p className="telemetry-text text-sm text-green-400">{msg}</p>
        </div>
      )}

      {confirmPaid ? (
        <div className="bg-amber-500/10 border border-amber-500/40 p-3 space-y-3">
          <p className="telemetry-text text-sm text-amber-400">{confirmPaid.text}</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => run(confirmPaid.action, true)}
              disabled={busy}
              className="telemetry-text text-sm uppercase tracking-wider bg-apex-red/15 text-apex-red border border-apex-red/40 hover:bg-apex-red/25 disabled:opacity-40 px-4 py-2.5"
            >
              {busy ? '…' : 'Cancel it anyway'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmPaid(null)}
              disabled={busy}
              className="telemetry-text text-sm uppercase tracking-wider bg-white/5 text-grid-white border border-white/15 hover:bg-white/10 disabled:opacity-40 px-4 py-2.5"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {canReopen && (
              <button
                type="button"
                onClick={() => run('reopen')}
                disabled={busy}
                className="telemetry-text text-sm uppercase tracking-wider bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/40 hover:bg-telemetry-cyan/25 disabled:opacity-40 px-4 py-2.5"
              >
                {busy ? '…' : 'Reopen booking'}
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => run('cancel')}
                disabled={busy}
                className="telemetry-text text-sm uppercase tracking-wider bg-apex-red/10 text-apex-red border border-apex-red/30 hover:bg-apex-red/20 disabled:opacity-40 px-4 py-2.5"
              >
                {busy ? '…' : 'Cancel booking'}
              </button>
            )}
          </div>

          <p className="telemetry-text text-xs text-pit-gray">
            {CLOSED_OUT.includes(status)
              ? 'Closed out by mistake? Reopen puts it back to confirmed. Emails and referral codes already sent by the close-out stand.'
              : status === 'cancelled'
                ? 'Reopen puts this back to confirmed and frees the slot back up.'
                : 'Cancelling frees the slot and removes it from the calendar. It never charges the no-show fee and never alters recorded money.'}
          </p>
        </>
      )}
    </div>
  )
}
