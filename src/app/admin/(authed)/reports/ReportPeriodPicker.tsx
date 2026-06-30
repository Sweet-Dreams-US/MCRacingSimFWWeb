'use client'

// Period filter for the Reports dashboard. Renders a row of period tabs plus
// an inline custom date-range form. Selecting a tab pushes new URL params so
// the server component re-renders for the chosen period; all date math itself
// lives server-side in resolveReportPeriod().
//
//   ?period=this_month|last_month|30d|90d|year|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PERIOD_OPTIONS,
  type ReportPeriodId,
} from '@/lib/report-periods'

interface ReportPeriodPickerProps {
  period: ReportPeriodId
  from: string
  to: string
}

export default function ReportPeriodPicker({
  period,
  from,
  to,
}: ReportPeriodPickerProps) {
  const router = useRouter()
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)
  const showCustom = period === 'custom'

  function selectPeriod(id: ReportPeriodId) {
    if (id === 'custom') {
      // Seed the custom inputs with the currently resolved range, then apply.
      router.replace(
        `?period=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
      )
      return
    }
    router.replace(`?period=${id}`)
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!customFrom || !customTo) return
    router.replace(
      `?period=custom&from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Period tabs */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Reporting period"
      >
        {PERIOD_OPTIONS.map((opt) => {
          const active = opt.id === period
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => selectPeriod(opt.id)}
              aria-pressed={active}
              className={`px-4 py-2 telemetry-text text-xs uppercase tracking-wider border transition-colors ${
                active
                  ? 'border-apex-red bg-apex-red/10 text-apex-red'
                  : 'border-white/10 text-grid-white hover:border-telemetry-cyan/60 hover:text-telemetry-cyan'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Custom range inputs — only when the custom tab is active */}
      {showCustom && (
        <form
          onSubmit={applyCustom}
          className="flex flex-wrap items-end gap-2"
          aria-label="Custom date range"
        >
          <label className="flex flex-col gap-1">
            <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
              From
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
              aria-label="Start date"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
              To
            </span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
              aria-label="End date"
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 telemetry-text text-xs uppercase tracking-wider border border-telemetry-cyan/60 text-telemetry-cyan hover:bg-telemetry-cyan/10 transition-colors"
          >
            Apply
          </button>
        </form>
      )}
    </div>
  )
}
