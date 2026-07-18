'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatLapTime } from '@/lib/laptime'

interface Entry {
  id: string
  display_name: string
  time_ms: number
  customer_id: string | null
}
interface Board {
  id: string
  track_name: string
  period_label: string | null
  is_active: boolean
}
interface CustomerHit {
  id: string
  name: string
  email: string | null
}

/** "John Doe" → "John D." — the privacy-friendly default for the public board. */
function firstLastInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

const medal = ['🥇', '🥈', '🥉']

export default function LeaderboardManager({
  board,
  initialEntries,
}: {
  board: Board
  initialEntries: Entry[]
}) {
  const router = useRouter()
  const [entries, setEntries] = useState<Entry[]>(initialEntries)

  // ---- Add a time --------------------------------------------------------
  const [name, setName] = useState('')
  const [time, setTime] = useState('')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<CustomerHit[]>([])
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        setHits(data.customers ?? [])
      } catch {
        setHits([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function refetch() {
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}/entries`)
      const data = await res.json()
      if (Array.isArray(data.entries)) setEntries(data.entries)
    } catch {
      /* leave as-is */
    }
  }

  function pickCustomer(hit: CustomerHit) {
    setCustomerId(hit.id)
    setName(firstLastInitial(hit.name))
    setQuery('')
    setHits([])
  }

  async function addEntry() {
    setAddMsg(null)
    if (!name.trim()) {
      setAddMsg({ tone: 'err', text: 'Enter a driver name (or pick a customer).' })
      return
    }
    if (!time.trim()) {
      setAddMsg({ tone: 'err', text: 'Enter a lap time.' })
      return
    }
    setAdding(true)
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, displayName: name.trim(), time: time.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the time')
      await refetch()
      const who = name.trim()
      if (data.status === 'added') setAddMsg({ tone: 'ok', text: `Added ${who} — ${formatLapTime(data.timeMs)}.` })
      else if (data.status === 'improved')
        setAddMsg({ tone: 'ok', text: `${who} improved to ${formatLapTime(data.timeMs)} (was ${formatLapTime(data.previousMs)}).` })
      else setAddMsg({ tone: 'warn', text: `Kept ${who}'s best (${formatLapTime(data.keptMs)}) — the new time wasn't faster.` })
      // Reset for the next driver.
      setName('')
      setTime('')
      setCustomerId(null)
      nameRef.current?.focus()
    } catch (err) {
      setAddMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Could not save the time' })
    } finally {
      setAdding(false)
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Remove this time from the board?')) return
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}/entries/${id}`, { method: 'DELETE' })
      if (res.ok) await refetch()
    } catch {
      /* ignore */
    }
  }

  // ---- Inline time edit --------------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTime, setEditTime] = useState('')

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: editTime.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not update the time')
        return
      }
      setEditingId(null)
      await refetch()
    } catch {
      alert('Could not update the time')
    }
  }

  // ---- Board settings ----------------------------------------------------
  const [trackName, setTrackName] = useState(board.track_name)
  const [periodLabel, setPeriodLabel] = useState(board.period_label ?? '')
  const [isActive, setIsActive] = useState(board.is_active)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)

  async function saveSettings() {
    setSettingsMsg(null)
    if (!trackName.trim()) {
      setSettingsMsg('Track name cannot be empty.')
      return
    }
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackName: trackName.trim(), periodLabel, isActive }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save')
      setSettingsMsg('Saved.')
      router.refresh()
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSavingSettings(false)
    }
  }

  async function deleteBoard() {
    if (!confirm(`Delete "${board.track_name}" and all ${entries.length} of its times? This can't be undone.`)) return
    try {
      const res = await fetch(`/api/admin/leaderboards/${board.id}`, { method: 'DELETE' })
      if (res.ok) router.push('/admin/leaderboards')
      else alert('Could not delete the leaderboard')
    } catch {
      alert('Could not delete the leaderboard')
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="racing-headline text-3xl text-grid-white">{board.track_name}</h1>
        {board.is_active && (
          <span className="telemetry-text text-xs px-2 py-0.5 bg-green-500/15 text-green-400 border border-green-500/30 uppercase tracking-wider">
            Active
          </span>
        )}
      </div>

      {/* Add a time */}
      <section className="bg-asphalt-dark border border-white/10 p-6 space-y-4 max-w-2xl">
        <h2 className="racing-headline text-lg text-grid-white">Add a time</h2>

        <div>
          <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
            Find a customer <span className="text-pit-gray/60">(optional)</span>
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="composer-input"
          />
          {hits.length > 0 && (
            <div className="mt-1 border border-white/10 divide-y divide-white/5">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => pickCustomer(h)}
                  className="block w-full text-left px-3 py-2 telemetry-text text-sm text-telemetry-cyan hover:bg-white/5"
                >
                  {h.name}
                  {h.email ? <span className="text-pit-gray"> · {h.email}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Display name *
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setCustomerId(null) // typing over a picked customer unlinks it
              }}
              placeholder="e.g. John D."
              className="composer-input"
            />
            {customerId && (
              <p className="telemetry-text text-[11px] text-green-400 mt-1">Linked to customer.</p>
            )}
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Lap time *
            </label>
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addEntry()
              }}
              placeholder="1:23.456 or 83.456"
              className="composer-input"
            />
          </div>
        </div>

        {addMsg && (
          <p
            className={`telemetry-text text-sm ${
              addMsg.tone === 'ok' ? 'text-green-400' : addMsg.tone === 'warn' ? 'text-amber-400' : 'text-apex-red'
            }`}
          >
            {addMsg.text}
          </p>
        )}

        <button
          type="button"
          onClick={addEntry}
          disabled={adding}
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark disabled:opacity-50 text-grid-white px-6 py-3 transition-colors"
        >
          {adding ? 'Saving…' : 'Add time'}
        </button>
        <p className="telemetry-text text-[11px] text-pit-gray">
          A driver already on the board keeps their best — a slower time is ignored.
        </p>
      </section>

      {/* Standings */}
      <section className="max-w-2xl">
        <h2 className="racing-headline text-lg text-grid-white mb-3">
          Standings <span className="text-pit-gray">({entries.length})</span>
        </h2>
        {entries.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">No times yet. Add the first above.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e, i) => (
              <div
                key={e.id}
                className="flex items-center gap-4 bg-asphalt-dark border border-white/5 px-4 py-3"
              >
                <div className="w-8 text-center racing-headline text-lg text-pit-gray">
                  {i < 3 ? medal[i] : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="telemetry-text text-grid-white truncate">{e.display_name}</p>
                </div>
                {editingId === e.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editTime}
                      onChange={(ev) => setEditTime(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') saveEdit(e.id)
                        if (ev.key === 'Escape') setEditingId(null)
                      }}
                      autoFocus
                      className="composer-input w-32 !py-1.5"
                    />
                    <button onClick={() => saveEdit(e.id)} className="telemetry-text text-xs text-green-400 hover:underline">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="telemetry-text text-xs text-pit-gray hover:underline">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="racing-headline text-lg text-telemetry-cyan tabular-nums">
                      {formatLapTime(e.time_ms)}
                    </div>
                    <button
                      onClick={() => {
                        setEditingId(e.id)
                        setEditTime(formatLapTime(e.time_ms))
                      }}
                      className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="telemetry-text text-xs text-apex-red/80 hover:text-apex-red"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settings */}
      <section className="bg-asphalt-dark border border-white/10 p-6 space-y-4 max-w-2xl">
        <h2 className="racing-headline text-lg text-grid-white">Board settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">Track name</label>
            <input value={trackName} onChange={(e) => setTrackName(e.target.value)} className="composer-input" />
          </div>
          <div>
            <label className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-1.5">
              Month / label
            </label>
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} className="composer-input" />
          </div>
        </div>
        <label className="flex items-start gap-3 bg-asphalt border border-white/10 p-4 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-1" />
          <span className="telemetry-text text-sm text-grid-white">
            Active board (shown on the public page)
            <span className="block text-xs text-pit-gray mt-1">
              Turning this on archives whichever board is currently active.
            </span>
          </span>
        </label>
        {settingsMsg && <p className="telemetry-text text-sm text-pit-gray">{settingsMsg}</p>}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="racing-headline text-sm uppercase tracking-wider bg-telemetry-cyan/15 text-telemetry-cyan border border-telemetry-cyan/40 hover:bg-telemetry-cyan/25 disabled:opacity-50 px-5 py-2.5"
          >
            {savingSettings ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={deleteBoard}
            className="telemetry-text text-xs uppercase tracking-wider text-apex-red/80 hover:text-apex-red"
          >
            Delete leaderboard
          </button>
        </div>
      </section>
    </div>
  )
}
