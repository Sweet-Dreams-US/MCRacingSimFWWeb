// /admin/pos — in-person point of sale on the Terminal reader.
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { getActiveReader, getTerminalLocationId } from '@/lib/terminal'
import { SALES_TAX_RATE_BPS } from '@/lib/tax'
import PosClient from './PosClient'

export default async function PosPage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const locationConfigured = Boolean(getTerminalLocationId())

  // Probe the reader so the page can show whether it's online before staff
  // try to charge.
  let readerLabel: string | null = null
  let readerOnline = false
  if (locationConfigured) {
    try {
      const reader = await getActiveReader()
      if (reader) {
        readerLabel = reader.label ?? reader.id
        readerOnline = reader.status === 'online'
      }
    } catch {
      // ignore — surfaced as "no reader" in the UI
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="racing-headline text-3xl text-grid-white">Point of Sale</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          Pick a booking on the right to prefill it, or charge a walk-in. Then hand
          the reader to the customer to tap &amp; tip.
        </p>
      </div>

      {/* Reader status banner */}
      <div
        className={`flex items-center gap-3 p-3 border ${
          readerOnline
            ? 'border-green-500/30 bg-green-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            readerOnline ? 'bg-green-400 animate-pulse' : 'bg-amber-400'
          }`}
        />
        <span className="telemetry-text text-sm text-grid-white">
          {!locationConfigured
            ? 'Terminal not configured yet.'
            : readerOnline
              ? `Reader online: ${readerLabel}`
              : readerLabel
                ? `Reader registered but offline: ${readerLabel} — check power + Wi-Fi.`
                : 'No reader registered yet. Pair the reader to this location.'}
        </span>
      </div>

      <PosClient readerOnline={readerOnline} taxRateBps={SALES_TAX_RATE_BPS} />
    </div>
  )
}
