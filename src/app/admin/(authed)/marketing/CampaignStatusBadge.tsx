// Small status pill for campaigns. Server-safe (no client hooks).
import type { Database } from '@/lib/supabase/types'

type CampaignStatus = Database['public']['Enums']['campaign_status']

const STYLES: Record<CampaignStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-white/5 text-pit-gray border-white/10',
  },
  sending: {
    label: 'Sending…',
    className: 'bg-telemetry-cyan/10 text-telemetry-cyan border-telemetry-cyan/30',
  },
  sent: {
    label: 'Sent',
    className: 'bg-green-500/10 text-green-400 border-green-500/30',
  },
  failed: {
    label: 'Failed',
    className: 'bg-apex-red/10 text-apex-red border-apex-red/30',
  },
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const s = STYLES[status] ?? STYLES.draft
  return (
    <span
      className={`telemetry-text text-xs px-2 py-1 border uppercase tracking-wider ${s.className}`}
    >
      {s.label}
    </span>
  )
}
