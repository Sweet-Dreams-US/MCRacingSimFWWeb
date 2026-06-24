'use client'

// Search box for the customer list. Updates ?q=... in the URL with a
// short debounce, which triggers Next.js to re-run the server component
// query with the new search term.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CustomerSearchInput({
  initialValue,
}: {
  initialValue: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(initialValue)

  // 250ms debounce — feels responsive without spamming the server
  useEffect(() => {
    if (value === initialValue) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim()) {
        params.set('q', value.trim())
      } else {
        params.delete('q')
      }
      router.replace(`?${params.toString()}`)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, initialValue, router, searchParams])

  return (
    <div className="relative max-w-md">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pit-gray pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full bg-asphalt border border-white/10 text-grid-white telemetry-text text-sm pl-10 pr-4 py-2 focus:border-telemetry-cyan focus:outline-none"
      />
    </div>
  )
}
