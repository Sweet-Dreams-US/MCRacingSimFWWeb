'use client'

// Meta (Facebook) Pixel — the browser half of our tracking. Loads fbevents.js,
// initializes the pixel, and fires a PageView on every route (including SPA
// client-side navigations, which the base snippet alone would miss).
//
// The server half is src/lib/meta/capi.ts. Conversion events (Lead, Schedule)
// are fired from BOTH sides with a shared `eventID` so Meta deduplicates them —
// see metaTrack() below and the callers in ContactClient / the confirmation page.
import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef } from 'react'

// Public, non-secret. Env-driven with the live id as a fallback so the pixel
// keeps working even if the env var is momentarily absent.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '936045282838979'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void
  }
}

/**
 * Fire a standard Pixel event from the browser. Pass `eventId` (the same value
 * you send to the CAPI call) so Meta dedupes the Pixel + server pair.
 */
export function metaTrack(
  event: string,
  data?: Record<string, unknown>,
  eventId?: string
): void {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, data ?? {}, eventId ? { eventID: eventId } : undefined)
  }
}

/**
 * Drop-in for server components (e.g. the booking confirmation page): fires one
 * Pixel event when it mounts in the browser. React strict-mode double-invokes
 * effects in dev, so we guard with a ref to keep it to exactly one send.
 */
export function MetaEventOnMount(props: {
  event: string
  data?: Record<string, unknown>
  eventId?: string
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    metaTrack(props.event, props.data, props.eventId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// PageView on client-side route changes. useSearchParams must sit inside a
// Suspense boundary or it opts the whole tree out of static rendering.
function RouteChangePageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const firstRun = useRef(true)
  useEffect(() => {
    // The inline snippet already fires the initial PageView on hard load; skip
    // the first effect run so we don't double-count the landing page.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    metaTrack('PageView')
  }, [pathname, searchParams])
  return null
}

export default function MetaPixel() {
  if (!PIXEL_ID) return null
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      <Suspense fallback={null}>
        <RouteChangePageView />
      </Suspense>
    </>
  )
}
