'use client'

import { DURATION_OPTIONS } from '@/lib/pricing'

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
    </div>
  )
}
