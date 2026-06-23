'use client'

// Signs the admin out and bounces them back to the login page.
// Lives in its own client component so the sidebar (which is also client) and
// any future server-rendered profile menu can both reuse it.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignOutButton() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async (): Promise<void> => {
    setIsSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // refresh() forces server components to re-render with the new (empty)
    // session cookie before the redirect lands.
    router.refresh()
    router.push('/admin/login')
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="w-full telemetry-text text-xs text-pit-gray uppercase tracking-wider border border-white/20 px-3 py-2 transition-colors hover:border-apex-red hover:text-apex-red disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isSigningOut ? 'Signing Out…' : 'Sign Out'}
    </button>
  )
}
