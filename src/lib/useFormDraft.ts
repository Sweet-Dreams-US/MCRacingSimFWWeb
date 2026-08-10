'use client'

// Keeps a half-filled admin form alive across navigation, tab switches, and
// phone app-switching.
//
// Why: staff start an entry, flip to the calendar or take a call, and come back
// to a blank form — the browser had discarded the page (very common on mobile,
// where a backgrounded tab gets evicted). React state doesn't survive that, so
// the draft is mirrored to localStorage and read back on mount.
//
// localStorage (not sessionStorage) because a killed tab loses the session
// store too. A TTL keeps a forgotten draft from resurfacing days later.

import { useEffect, useRef, useState } from 'react'

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

interface Stored<T> {
  savedAt: number
  values: T
}

export interface FormDraft<T> {
  /** Draft values found on mount (null when there was nothing fresh to restore). */
  restored: T | null
  /** Persist the current values. Safe to call on every render/change. */
  save: (values: T) => void
  /** Forget the draft — call on successful submit and on an explicit cancel. */
  clear: () => void
}

export function useFormDraft<T>(key: string, ttlMs: number = DEFAULT_TTL_MS): FormDraft<T> {
  const [restored, setRestored] = useState<T | null>(null)
  // Suppress saves until after the restore pass, so the initial empty state
  // can't overwrite a good draft.
  const readyRef = useRef(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as Stored<T>
        if (parsed && typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt < ttlMs) {
          setRestored(parsed.values)
        } else {
          window.localStorage.removeItem(key)
        }
      }
    } catch {
      // Corrupt or unavailable storage (private mode) — just start fresh.
    }
    readyRef.current = true
  }, [key, ttlMs])

  const save = (values: T) => {
    if (!readyRef.current) return
    try {
      const payload: Stored<T> = { savedAt: Date.now(), values }
      window.localStorage.setItem(key, JSON.stringify(payload))
    } catch {
      // Storage full or blocked — persistence is a convenience, never fatal.
    }
  }

  const clear = () => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
    setRestored(null)
  }

  return { restored, save, clear }
}
