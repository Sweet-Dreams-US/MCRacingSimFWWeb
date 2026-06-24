'use client'

// Year + month picker for the reports page. Updates the URL so the server
// component re-renders with the new period. Native <select> elements keep
// this lightweight and accessible without any extra CSS.
import { useRouter } from 'next/navigation'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function ReportPeriodPicker({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  // Show 6 years back through next year — covers practical reporting needs.
  const years: number[] = []
  for (let y = currentYear + 1; y >= currentYear - 6; y--) years.push(y)

  function update(newYear: number, newMonth: number) {
    router.replace(`?year=${newYear}&month=${newMonth}`)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(e) => update(year, parseInt(e.target.value, 10))}
        className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
        aria-label="Month"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => update(parseInt(e.target.value, 10), month)}
        className="bg-asphalt-dark border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
        aria-label="Year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  )
}
