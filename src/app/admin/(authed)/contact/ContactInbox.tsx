'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONTACT_REASONS, contactReasonLabel } from '@/lib/contact'

export interface InquiryRow {
  id: string
  reason: string
  name: string
  email: string
  phone: string | null
  message: string
  preferred_date: string | null
  group_size: number | null
  status: string
  created_at: string
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const REASON_ACCENT: Record<string, string> = {
  birthday: 'bg-apex-red/15 text-apex-red border-apex-red/30',
  corporate: 'bg-telemetry-cyan/15 text-telemetry-cyan border-telemetry-cyan/30',
  large_group: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  general: 'bg-white/5 text-pit-gray border-white/10',
  other: 'bg-white/5 text-pit-gray border-white/10',
}

export default function ContactInbox({ initial }: { initial: InquiryRow[] }) {
  const router = useRouter()
  const [reasonFilter, setReasonFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'new' | 'handled' | 'all'>('new')
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = initial.filter(
    (i) =>
      (reasonFilter === 'all' || i.reason === reasonFilter) &&
      (statusFilter === 'all' || i.status === statusFilter)
  )

  const newCount = initial.filter((i) => i.status === 'new').length

  async function setStatus(id: string, status: 'new' | 'handled') {
    setBusyId(id)
    await fetch(`/api/admin/contact/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setBusyId(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(['new', 'handled', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`telemetry-text text-xs uppercase tracking-wider px-3 py-1.5 border transition-colors ${
                statusFilter === s
                  ? 'border-apex-red text-grid-white bg-apex-red/10'
                  : 'border-white/10 text-pit-gray hover:text-grid-white'
              }`}
            >
              {s}
              {s === 'new' && newCount > 0 ? ` (${newCount})` : ''}
            </button>
          ))}
        </div>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="bg-asphalt-dark border border-white/15 text-grid-white telemetry-text text-sm px-3 py-1.5"
        >
          <option value="all">All reasons</option>
          {CONTACT_REASONS.map((r) => (
            <option key={r} value={r}>
              {contactReasonLabel(r)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-10 text-center">
          <p className="telemetry-text text-pit-gray">No inquiries here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((i) => (
            <div
              key={i.id}
              className={`bg-asphalt-dark border p-5 ${
                i.status === 'new' ? 'border-apex-red/30' : 'border-white/5'
              }`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`telemetry-text text-xs px-2 py-1 border uppercase tracking-wider ${
                      REASON_ACCENT[i.reason] ?? REASON_ACCENT.other
                    }`}
                  >
                    {contactReasonLabel(i.reason)}
                  </span>
                  <span className="racing-headline text-lg text-grid-white">{i.name}</span>
                  {i.status === 'new' && (
                    <span className="telemetry-text text-xs px-2 py-0.5 bg-apex-red text-white uppercase tracking-wider">
                      New
                    </span>
                  )}
                </div>
                <span className="telemetry-text text-xs text-pit-gray">{formatWhen(i.created_at)}</span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <a href={`mailto:${i.email}`} className="telemetry-text text-sm text-telemetry-cyan hover:underline break-all">
                  {i.email}
                </a>
                {i.phone && (
                  <a href={`tel:${i.phone}`} className="telemetry-text text-sm text-telemetry-cyan hover:underline">
                    {i.phone}
                  </a>
                )}
                {i.preferred_date && (
                  <span className="telemetry-text text-sm text-pit-gray">Date: {formatDate(i.preferred_date)}</span>
                )}
                {i.group_size && (
                  <span className="telemetry-text text-sm text-pit-gray">Group: {i.group_size}</span>
                )}
              </div>

              <p className="telemetry-text text-sm text-grid-white mt-3 whitespace-pre-wrap">{i.message}</p>

              <div className="mt-4">
                {i.status === 'new' ? (
                  <button
                    type="button"
                    onClick={() => setStatus(i.id, 'handled')}
                    disabled={busyId === i.id}
                    className="telemetry-text text-xs uppercase tracking-wider border border-green-500/40 text-green-400 hover:bg-green-500/10 px-4 py-2 transition-colors disabled:opacity-50"
                  >
                    {busyId === i.id ? '…' : '✓ Mark handled'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStatus(i.id, 'new')}
                    disabled={busyId === i.id}
                    className="telemetry-text text-xs uppercase tracking-wider border border-white/10 text-pit-gray hover:text-grid-white px-4 py-2 transition-colors disabled:opacity-50"
                  >
                    {busyId === i.id ? '…' : 'Reopen'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
