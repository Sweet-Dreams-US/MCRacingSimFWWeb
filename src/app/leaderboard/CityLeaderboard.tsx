'use client'

import { useState } from 'react'
import { formatLapTime } from '@/lib/laptime'

export interface PublicBoard {
  id: string
  trackName: string
  periodLabel: string | null
  isActive: boolean
  entries: { name: string; timeMs: number }[]
}

const MEDAL = ['🥇', '🥈', '🥉']

export default function CityLeaderboard({ boards }: { boards: PublicBoard[] }) {
  const [selectedId, setSelectedId] = useState(boards[0]?.id ?? '')
  const board = boards.find((b) => b.id === selectedId) ?? boards[0] ?? null

  return (
    <section id="leaderboard" className="relative bg-asphalt py-16 sm:py-24 px-4 border-b border-white/5">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <p className="telemetry-text text-xs sm:text-sm text-apex-red uppercase tracking-[0.3em] mb-3">
            MC Racing Sim · Fort Wayne
          </p>
          <h1 className="racing-headline text-4xl sm:text-6xl text-grid-white">
            City <span className="text-apex-red">Leaderboard</span>
          </h1>
          <p className="telemetry-text text-sm sm:text-base text-pit-gray mt-4 max-w-xl mx-auto">
            A new track every month. Set the fastest lap in Fort Wayne and put your name on top.
          </p>
        </div>

        {!board || board.entries.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/10 p-10 text-center">
            <p className="racing-headline text-2xl text-grid-white mb-2">
              {board ? board.trackName : 'This month’s board drops soon'}
            </p>
            <p className="telemetry-text text-sm text-pit-gray">
              {board
                ? 'No times posted yet — be the first to set a lap.'
                : 'Come race a session and get your time on the board.'}
            </p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/10">
            {/* Board header */}
            <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 border-b border-white/10">
              <div>
                <h2 className="racing-headline text-2xl text-grid-white">{board.trackName}</h2>
                {board.periodLabel && (
                  <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-0.5">
                    {board.periodLabel}
                  </p>
                )}
              </div>
              {board.isActive && (
                <span className="telemetry-text text-xs px-3 py-1 bg-apex-red/15 text-apex-red border border-apex-red/40 uppercase tracking-wider">
                  This month
                </span>
              )}
            </div>

            {/* Standings */}
            <ol className="divide-y divide-white/5">
              {board.entries.map((e, i) => (
                <li
                  key={`${e.name}-${i}`}
                  className={`flex items-center gap-4 px-6 py-3.5 ${i < 3 ? 'bg-white/[0.02]' : ''}`}
                >
                  <span className="w-9 text-center racing-headline text-xl text-pit-gray">
                    {i < 3 ? MEDAL[i] : i + 1}
                  </span>
                  <span
                    className={`flex-1 min-w-0 truncate telemetry-text ${
                      i === 0 ? 'text-grid-white text-lg' : 'text-grid-white'
                    }`}
                  >
                    {e.name}
                  </span>
                  <span
                    className={`racing-headline tabular-nums ${
                      i === 0 ? 'text-2xl text-apex-red' : 'text-lg text-telemetry-cyan'
                    }`}
                  >
                    {formatLapTime(e.timeMs)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Past months */}
        {boards.length > 1 && (
          <div className="mt-6">
            <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2 text-center">
              Browse tracks
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {boards.map((b) => {
                const active = b.id === board?.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedId(b.id)}
                    className={`telemetry-text text-xs px-3 py-1.5 border transition-colors ${
                      active
                        ? 'bg-apex-red text-grid-white border-apex-red'
                        : 'bg-transparent text-pit-gray border-white/15 hover:border-white/40 hover:text-grid-white'
                    }`}
                  >
                    {b.trackName}
                    {b.isActive ? ' ·' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
