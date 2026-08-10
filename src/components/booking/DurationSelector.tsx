'use client'

import { DURATION_OPTIONS, MAX_DURATION_HOURS, formatDuration } from '@/lib/pricing'

interface DurationSelectorProps {
  value: number
  onChange: (duration: number) => void
}

// Half-hours are priced at the exact midpoint of the whole hours either side.
const DESCRIPTIONS: Record<string, string> = {
  '1': 'Quick session',
  '1.5': 'A little longer',
  '2': 'Standard session',
  '2.5': 'Good and long',
  '3': 'Extended session',
}

function label(hours: number): string {
  return Number.isInteger(hours) ? `${hours} Hour${hours === 1 ? '' : 's'}` : `${hours} Hours`
}

export default function DurationSelector({ value, onChange }: DurationSelectorProps) {
  const isLongSession = value > 3

  return (
    <div className="space-y-4">
      <h3 className="racing-headline text-xl text-grid-white">
        Session <span className="text-telemetry-cyan">Length</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {DURATION_OPTIONS.map((duration) => (
          <button
            key={duration}
            type="button"
            onClick={() => onChange(duration)}
            className={`p-4 border transition-all text-center ${
              value === duration
                ? 'border-telemetry-cyan bg-telemetry-cyan/10'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            <div className="racing-headline text-2xl text-grid-white mb-1">
              {label(duration)}
            </div>
            <div className="telemetry-text text-sm text-pit-gray">
              {DESCRIPTIONS[String(duration)] ?? ''}
            </div>
          </button>
        ))}
      </div>

      {/* Longer bookings (parties, corporate days) — up to the whole day. */}
      {!isLongSession ? (
        <button
          type="button"
          onClick={() => onChange(3.5)}
          className="w-full p-3 border border-white/10 hover:border-telemetry-cyan/50 transition-colors text-center"
        >
          <span className="telemetry-text text-sm text-telemetry-cyan">
            + Need longer than 3 hours?
          </span>
          <span className="block telemetry-text text-xs text-pit-gray mt-0.5">
            Book up to the whole day — great for parties and corporate events
          </span>
        </button>
      ) : (
        <div className="p-4 border border-telemetry-cyan bg-telemetry-cyan/10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="telemetry-text text-sm text-grid-white">Session length</p>
              <p className="telemetry-text text-xs text-pit-gray mt-0.5">
                Half-hour steps, up to {MAX_DURATION_HOURS} hours
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onChange(Math.max(1, value - 0.5))}
                aria-label="Half an hour shorter"
                className="w-10 h-10 border border-white/20 hover:border-white/50 racing-headline text-xl text-grid-white transition-colors"
              >
                −
              </button>
              <span className="racing-headline text-2xl text-grid-white w-20 text-center tabular-nums">
                {formatDuration(value)}
              </span>
              <button
                type="button"
                onClick={() => onChange(Math.min(MAX_DURATION_HOURS, value + 0.5))}
                aria-label="Half an hour longer"
                className="w-10 h-10 border border-white/20 hover:border-white/50 racing-headline text-xl text-grid-white transition-colors"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
