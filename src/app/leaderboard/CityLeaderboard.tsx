'use client'

import { useState } from 'react'
import { formatLapTime } from '@/lib/laptime'

export interface PublicBoard {
  id: string
  trackName: string
  periodLabel: string | null
  isActive: boolean
  mapImageUrl: string | null
  photoImageUrl: string | null
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

        {!board ? (
          <div className="bg-asphalt-dark border border-white/10 p-10 text-center">
            <p className="racing-headline text-2xl text-grid-white mb-2">This month’s board drops soon</p>
            <p className="telemetry-text text-sm text-pit-gray">
              Come race a session and get your time on the board.
            </p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/10 overflow-hidden">
            {/* Board header — photo banner if we have one, else a text row.
                The track map (if any) rides in the corner. */}
            {board.photoImageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={board.photoImageUrl}
                  alt={`${board.trackName} track`}
                  className="w-full h-44 sm:h-56 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-asphalt-dark via-asphalt-dark/30 to-transparent" />
                {board.mapImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={board.mapImageUrl}
                    alt="Track map"
                    className="absolute top-3 right-3 h-16 sm:h-20 w-auto object-contain bg-asphalt-dark/70 border border-white/15 p-1"
                  />
                )}
                <div className="absolute bottom-0 inset-x-0 px-6 py-4 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="racing-headline text-2xl sm:text-3xl text-grid-white">{board.trackName}</h2>
                    {board.periodLabel && (
                      <p className="telemetry-text text-xs text-grid-white/80 uppercase tracking-wider mt-0.5">
                        {board.periodLabel}
                      </p>
                    )}
                  </div>
                  {board.isActive && (
                    <span className="telemetry-text text-xs px-3 py-1 bg-apex-red/90 text-grid-white uppercase tracking-wider flex-shrink-0">
                      This month
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-4 min-w-0">
                  {board.mapImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={board.mapImageUrl}
                      alt="Track map"
                      className="h-14 w-auto object-contain bg-asphalt border border-white/10 p-1 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <h2 className="racing-headline text-2xl text-grid-white truncate">{board.trackName}</h2>
                    {board.periodLabel && (
                      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-0.5">
                        {board.periodLabel}
                      </p>
                    )}
                  </div>
                </div>
                {board.isActive && (
                  <span className="telemetry-text text-xs px-3 py-1 bg-apex-red/15 text-apex-red border border-apex-red/40 uppercase tracking-wider">
                    This month
                  </span>
                )}
              </div>
            )}

            {/* Standings */}
            {board.entries.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="telemetry-text text-sm text-pit-gray">
                  No times posted yet — be the first to set a lap.
                </p>
              </div>
            ) : (
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
            )}
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
