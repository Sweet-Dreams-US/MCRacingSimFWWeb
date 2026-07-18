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
): boolean {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', event, data ?? {}, eventId ? { eventID: eventId } : undefined)
    return true // dispatched (fbq queues even before the library finishes loading)
  }
  return false // fbq not ready yet (or SSR) — caller may retry
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
  // When true (and an eventId is given), also guard against a browser REFRESH
  // in the same tab, keyed by eventId — so reloading e.g. the booking
  // confirmation page never re-fires the conversion. The useRef alone only
  // covers React strict-mode's double-invoke within a single mount.
  once?: boolean
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return

    const key = props.once && props.eventId ? `mp_fired_${props.eventId}` : null
    // Durable refresh guard: only skip if a PRIOR mount actually dispatched this
    // event this session (the key is written after a confirmed dispatch below).
    if (key) {
      try {
        if (sessionStorage.getItem(key)) {
          fired.current = true
          return
        }
      } catch {
        // sessionStorage blocked (private mode) — no durable guard; Meta still
        // dedupes by eventId, so a resend is harmless.
      }
    }

    // On a HARD page load (e.g. a 3DS return_url redirect to the confirmation
    // page) the afterInteractive Pixel snippet may not have defined window.fbq
    // yet when this effect runs. Retry briefly until it's ready, then fire ONCE.
    // Crucially we mark "fired" only AFTER a real dispatch, so a no-op never
    // burns the durable guard (which would otherwise suppress the self-healing
    // refresh and permanently drop the browser Pixel).
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tryFire = () => {
      if (fired.current) return
      if (metaTrack(props.event, props.data, props.eventId)) {
        fired.current = true
        if (key) {
          try {
            sessionStorage.setItem(key, '1')
          } catch {
            /* ignore */
          }
        }
        return
      }
      if (attempts++ < 30) timer = setTimeout(tryFire, 100) // up to ~3s, then give up
    }
    tryFire()
    return () => {
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

// Sitewide Contact event: any click on a tel:/mailto: link (call buttons in
// the nav, footer, call-to-book popup, contact page) counts as the customer
// reaching out. One capture-phase listener beats sprinkling handlers on every
// phone link in the codebase.
function ContactClickTracker() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href^="tel:"], a[href^="mailto:"]')
      if (!anchor) return
      const isCall = anchor.getAttribute('href')?.startsWith('tel:')
      metaTrack('Contact', { content_name: isCall ? 'phone_call' : 'email' })
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
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
      <ContactClickTracker />
    </>
  )
}
