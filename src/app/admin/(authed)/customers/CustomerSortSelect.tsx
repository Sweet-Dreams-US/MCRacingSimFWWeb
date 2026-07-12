'use client'

// Sort dropdown for the customer list. Updates ?sort=... in the URL (preserving
// the search term), which re-runs the server component's ordered query.
import { useRouter, useSearchParams } from 'next/navigation'

export type CustomerSort = 'recent' | 'spent' | 'bookings' | 'name' | 'newest'

export const CUSTOMER_SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Recently visited' },
  { value: 'spent', label: 'Most spent' },
  { value: 'bookings', label: 'Most bookings' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'newest', label: 'Newest' },
]

export default function CustomerSortSelect({ value }: { value: CustomerSort }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'recent') params.delete('sort')
    else params.set('sort', next)
    router.replace(`?${params.toString()}`)
  }

  return (
    <label className="flex items-center gap-2 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
      Sort
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-asphalt border border-white/10 text-grid-white telemetry-text text-sm px-3 py-2 focus:border-telemetry-cyan focus:outline-none"
      >
        {CUSTOMER_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}
