'use client'

import { useEffect, useState } from 'react'

// The Blog link in the navigation shows only once a post has been released.
// Asked of the server in the browser, so it appears and disappears without a
// deploy. One request per page load is shared by the header and the footer.
let pending: Promise<boolean> | null = null

function fetchHasBlog(): Promise<boolean> {
  if (!pending) {
    pending = fetch('/api/blog/status/', { cache: 'no-store' })
      .then(res => (res.ok ? res.json() : { hasBlog: false }))
      .then(data => Boolean(data && data.hasBlog))
      .catch(() => false)
  }
  return pending
}

export function useHasBlog(): boolean {
  const [hasBlog, setHasBlog] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchHasBlog().then(value => {
      if (!cancelled) setHasBlog(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return hasBlog
}
