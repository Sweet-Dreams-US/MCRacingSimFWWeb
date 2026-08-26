'use client'

// Email input with returning-customer suggestions, used on the public booking
// and check-in forms. After 3+ typed characters it fetches known emails that
// START with the typed prefix and shows them in a dropdown; picking one fills
// the email and (optionally) pulls safe prefill fields for the rest of the
// form via /api/checkin/lookup — so returning customers stop retyping.
//
// The endpoint enforces the harvesting guardrails (prefix-only, 3-char min,
// 5-result cap); this component just debounces and renders.
import { useEffect, useRef, useState } from 'react'

export interface PrefillCustomer {
  firstName: string
  lastName: string
  phone: string
  birthday: string
}

interface Suggestion {
  email: string
  name: string
}

interface EmailSuggestInputProps {
  value: string
  onChange: (email: string) => void
  /** Fired after a suggestion is picked AND its customer record is fetched. */
  onPickCustomer?: (c: PrefillCustomer) => void
  className?: string
  placeholder?: string
  required?: boolean
}

export default function EmailSuggestInput({
  value,
  onChange,
  onPickCustomer,
  className,
  placeholder,
  required,
}: EmailSuggestInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The email we just picked — suppress re-opening the dropdown for it.
  const pickedRef = useRef<string | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = value.trim()
    if (q.length < 3 || q.toLowerCase() === pickedRef.current) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/customers/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q }),
        })
        const data = await res.json()
        const list: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
        // Don't show a single suggestion that's exactly what's already typed.
        const filtered = list.filter((s) => s.email !== q.toLowerCase() || list.length > 1)
        setSuggestions(filtered)
        setOpen(filtered.length > 0)
      } catch {
        setSuggestions([])
        setOpen(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  const pick = async (email: string) => {
    pickedRef.current = email
    onChange(email)
    setOpen(false)
    setSuggestions([])
    if (!onPickCustomer) return
    try {
      const res = await fetch('/api/checkin/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.found && data.customer) onPickCustomer(data.customer as PrefillCustomer)
    } catch {
      // Prefill is a nicety — the picked email is already in the field.
    }
  }

  return (
    <div className="relative">
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Delay closing so a click on a suggestion lands before the list hides.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={className}
        placeholder={placeholder}
        required={required}
        name="email"
        autoComplete="email"
      />
      {open && (
        <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-asphalt-dark border border-telemetry-cyan/40 shadow-lg max-h-56 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.email}>
              <button
                type="button"
                // Prevent the input blur from firing before our click handler.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.email)}
                className="w-full text-left px-4 py-2.5 telemetry-text text-sm text-grid-white hover:bg-telemetry-cyan/10"
              >
                {s.email}
                {s.name ? <span className="text-pit-gray"> — {s.name}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
