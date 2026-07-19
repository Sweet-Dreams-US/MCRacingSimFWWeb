'use client'

// Create + delete availability blocks. A block is a date plus either a time
// window or "whole day"; online booking refuses any session overlapping it.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/pricing'

export interface BlockRow {
  id: string
  block_date: string
  start_time: string | null // Postgres TIME "HH:MM:SS", null = whole day
  end_time: string | null
  reason: string | null
  created_at: string
}

// Selectable times cover the operating window noon -> 2am in 30-min steps.
// Values are 24-hour "HH:MM" (what the API + DB use); labels are 12-hour.
function buildTimeOptions(): Array<{ value: string; label: string }> {
  const opts: Array<{ value: string; label: string }> = []
  const push = (hour24: number, minute: number) => {
    const value = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const period = hour24 >= 12 ? 'PM' : 'AM'
    const displayHour = hour24 % 12 || 12
    opts.push({ value, label: `${displayHour}:${String(minute).padStart(2, '0')} ${period}` })
  }
  for (let hour = 12; hour <= 23; hour++) {
    push(hour, 0)
    push(hour, 30)
  }
  // Late-night tail: midnight through 2:00 AM close.
  push(0, 0)
  push(0, 30)
  push(1, 0)
  push(1, 30)
  push(2, 0)
  return opts
}

const TIME_OPTIONS = buildTimeOptions()

/** "HH:MM[:SS]" 24-hour -> "1:30 AM" style label for the list. */
function timeLabel(time: string): string {
  const [hStr = '0', mStr = '00'] = time.split(':')
  const hour24 = parseInt(hStr, 10)
  const period = hour24 >= 12 ? 'PM' : 'AM'
  const displayHour = hour24 % 12 || 12
  return `${displayHour}:${mStr.slice(0, 2)} ${period}`
}

export default function AvailabilityManager({ initialBlocks }: { initialBlocks: BlockRow[] }) {
  const router = useRouter()
  const [blockDate, setBlockDate] = useState('')
  const [wholeDay, setWholeDay] = useState(false)
  const [startTime, setStartTime] = useState('12:00')
  const [endTime, setEndTime] = useState('14:00')
  const [reason, setReason] = useState('')

  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  async function create() {
    setError(null)
    setCreated(false)
    if (!blockDate) {
      setError('Pick a date.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockDate,
          wholeDay,
          startTime: wholeDay ? undefined : startTime,
          endTime: wholeDay ? undefined : endTime,
          reason: reason.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Create failed')
      setCreated(true)
      setReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setError(null)
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/availability/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Delete failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Create */}
      <div className="bg-asphalt-dark border border-white/10 p-6 space-y-4">
        <h2 className="racing-headline text-lg text-grid-white">Block time off</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Date</label>
            <input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
              className="composer-input"
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wholeDay}
                onChange={(e) => setWholeDay(e.target.checked)}
                className="w-4 h-4 accent-apex-red"
              />
              <span className="telemetry-text text-sm text-grid-white">Block the whole day</span>
            </label>
          </div>
        </div>

        {!wholeDay && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">From</label>
              <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="composer-input">
                {TIME_OPTIONS.slice(0, -1).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Until</label>
              <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="composer-input">
                {TIME_OPTIONS.slice(1).map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Reason <span className="text-pit-gray/60">(internal — customers never see it)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Private event, maintenance, league night…"
            className="composer-input"
          />
        </div>

        {error && (
          <div className="bg-apex-red/10 border border-apex-red/30 p-3">
            <p className="telemetry-text text-sm text-apex-red">{error}</p>
          </div>
        )}
        {created && (
          <div className="bg-green-500/10 border border-green-500/30 p-3">
            <p className="telemetry-text text-sm text-green-400">
              Block created — those times are hidden from online booking now.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
        >
          {saving ? 'Blocking…' : 'Block it off'}
        </button>
      </div>

      {/* List */}
      <div>
        <h2 className="racing-headline text-lg text-grid-white mb-3">Upcoming blocks</h2>
        {initialBlocks.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">
              Nothing blocked — every operating hour is bookable online.
            </p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/5 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-white/10">
                <tr className="text-left">
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Date</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Time</th>
                  <th className="p-3 telemetry-text text-xs text-pit-gray uppercase tracking-wider">Reason</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {initialBlocks.map((b) => (
                  <tr key={b.id} className="border-b border-white/5 last:border-b-0">
                    <td className="p-3 telemetry-text text-sm text-grid-white font-bold whitespace-nowrap">
                      {formatDate(b.block_date)}
                    </td>
                    <td className="p-3 telemetry-text text-sm text-grid-white whitespace-nowrap">
                      {b.start_time && b.end_time ? (
                        `${timeLabel(b.start_time)} – ${timeLabel(b.end_time)}`
                      ) : (
                        <span className="text-apex-red uppercase text-xs font-bold">All day</span>
                      )}
                    </td>
                    <td className="p-3 telemetry-text text-sm text-pit-gray">{b.reason || '—'}</td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove(b.id)}
                        disabled={deletingId === b.id}
                        className="telemetry-text text-xs text-pit-gray hover:text-apex-red uppercase disabled:opacity-50"
                      >
                        {deletingId === b.id ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
