'use client'

import { SIM_COUNT, EXTRA_RACER_RATE_PER_HOUR } from '@/lib/pricing'

interface RacerCountSelectorProps {
  value: number
  onChange: (count: number) => void
}

export default function RacerCountSelector({ value, onChange }: RacerCountSelectorProps) {
  const options: { count: number; description: string }[] = [
    { count: 1, description: 'Solo session' },
    { count: 2, description: 'Bring a friend' },
    { count: 3, description: 'Full grid' },
  ]
  // Past the sim count the group shares the rigs, so the UI switches from
  // "pick a seat" tiles to a plain counter.
  const isBigGroup = value > SIM_COUNT

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        How Many <span className="text-apex-red">Racers?</span>
      </h3>
      <div className="grid grid-cols-3 gap-4">
        {options.map((option) => (
          <button
            key={option.count}
            type="button"
            onClick={() => onChange(option.count)}
            className={`p-4 border transition-all text-center ${
              value === option.count
                ? 'border-apex-red bg-apex-red/10'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            <div className="racing-headline text-3xl text-grid-white mb-1">
              {option.count}
            </div>
            <div className="telemetry-text text-sm text-pit-gray">
              {option.description}
            </div>
          </button>
        ))}
      </div>

      {/* Bigger groups — everyone shares the 3 sims and rotates through. */}
      {!isBigGroup ? (
        <button
          type="button"
          onClick={() => onChange(SIM_COUNT + 1)}
          className="w-full p-3 border border-white/10 hover:border-telemetry-cyan/50 transition-colors text-center"
        >
          <span className="telemetry-text text-sm text-telemetry-cyan">
            + Bigger group? Add more racers
          </span>
          <span className="block telemetry-text text-xs text-pit-gray mt-0.5">
            Just ${EXTRA_RACER_RATE_PER_HOUR}/hour each past {SIM_COUNT} — you share the sims
          </span>
        </button>
      ) : (
        <div className="p-4 border border-apex-red bg-apex-red/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="telemetry-text text-sm text-grid-white">Group size</p>
              <p className="telemetry-text text-xs text-pit-gray mt-0.5">
                ${EXTRA_RACER_RATE_PER_HOUR}/hour each past {SIM_COUNT}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChange(value - 1)}
                aria-label="One fewer racer"
                className="w-10 h-10 border border-white/20 hover:border-white/50 racing-headline text-xl text-grid-white transition-colors"
              >
                −
              </button>
              <span className="racing-headline text-3xl text-grid-white w-10 text-center tabular-nums">
                {value}
              </span>
              <button
                type="button"
                onClick={() => onChange(value + 1)}
                aria-label="One more racer"
                className="w-10 h-10 border border-white/20 hover:border-white/50 racing-headline text-xl text-grid-white transition-colors"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="telemetry-text text-xs text-pit-gray">
        <span className="text-telemetry-cyan">Note:</span> Price is per session, not per person.
        Everyone races together!{' '}
        {isBigGroup &&
          `With ${value} racers you'll rotate through the ${SIM_COUNT} sims — the whole place is yours.`}
      </p>
    </div>
  )
}
