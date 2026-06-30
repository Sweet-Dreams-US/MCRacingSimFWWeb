'use client'

// While a campaign is "sending", quietly refresh the route every few seconds so
// the stat cards climb on their own. When the server re-renders with a non-
// sending status this component is no longer mounted, so the polling stops.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SendingPoller() {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [router])
  return null
}
