'use client'

// Email + password login. One admin account, no email confirmation, no
// magic-link redirect. On success we hard-navigate to /admin so the
// middleware picks up the fresh session cookie.
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface LoginFormProps {
  initialError: string | null
}

type Status = 'idle' | 'signing-in' | 'error'

export default function LoginForm({ initialError }: LoginFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setStatus('signing-in')
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setStatus('error')
      setErrorMessage(
        error.message === 'Invalid login credentials'
          ? 'Wrong email or password.'
          : error.message
      )
      return
    }

    // Full navigation (not router.push) so the middleware reads the new
    // session cookie and the (authed) layout admits us.
    window.location.assign('/admin')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="admin-email"
          className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2"
        >
          Email Address *
        </label>
        <input
          id="admin-email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === 'signing-in'}
          className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors disabled:opacity-50"
          placeholder="you@mcracingfortwayne.com"
        />
      </div>

      <div>
        <label
          htmlFor="admin-password"
          className="block telemetry-text text-xs text-pit-gray uppercase tracking-wider mb-2"
        >
          Password *
        </label>
        <input
          id="admin-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={status === 'signing-in'}
          className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors disabled:opacity-50"
          placeholder="••••••••"
        />
      </div>

      {errorMessage && (
        <div className="bg-apex-red/10 border border-apex-red px-4 py-3">
          <p className="telemetry-text text-sm text-apex-red">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'signing-in' || email.trim() === '' || password === ''}
        className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'signing-in' ? 'Signing In…' : 'Sign In'}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center leading-relaxed">
        Authorized staff only.
      </p>
    </form>
  )
}
