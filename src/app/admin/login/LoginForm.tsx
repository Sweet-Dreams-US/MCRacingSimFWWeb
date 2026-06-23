'use client'

// Magic-link login form. Hits Supabase's OTP flow with the current origin as
// the redirect target — the email link lands at /auth/callback which finishes
// the exchange and forwards to /admin.
import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

interface LoginFormProps {
  initialError: string | null
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

export default function LoginForm({ initialError }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  // We seed errorMessage from the server-side ?error= query (e.g. failed callback)
  // so users see why they bounced back here.
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setStatus('sending')
    setErrorMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }

    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="text-center">
        <div className="text-5xl mb-4 text-telemetry-cyan">✓</div>
        <h2 className="racing-headline text-2xl text-grid-white mb-3">
          Check Your <span className="text-telemetry-cyan">Email</span>
        </h2>
        <p className="telemetry-text text-sm text-pit-gray mb-6">
          We sent a sign-in link to <span className="text-grid-white">{email}</span>.
          Click it to enter the pit crew console.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle')
            setEmail('')
          }}
          className="telemetry-text text-xs text-pit-gray uppercase tracking-wider hover:text-apex-red transition-colors"
        >
          Use a different email
        </button>
      </div>
    )
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
          disabled={status === 'sending'}
          className="w-full bg-asphalt border border-white/20 px-4 py-3 text-grid-white telemetry-text focus:border-telemetry-cyan focus:outline-none transition-colors disabled:opacity-50"
          placeholder="you@mcracingfortwayne.com"
        />
      </div>

      {errorMessage && (
        <div className="bg-apex-red/10 border border-apex-red px-4 py-3">
          <p className="telemetry-text text-sm text-apex-red">{errorMessage}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'sending' || email.trim() === ''}
        className="btn-primary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'Sending Link…' : 'Send Magic Link'}
      </button>

      <p className="telemetry-text text-xs text-pit-gray text-center leading-relaxed">
        We&apos;ll email you a one-time sign-in link. No password to remember,
        no password to leak.
      </p>
    </form>
  )
}
