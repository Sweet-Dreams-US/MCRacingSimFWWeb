// Admin login page — public route (not gated by /admin/* middleware redirect
// because it's the destination of that redirect). If someone is already signed
// in and has a valid admin_users row, send them straight to the dashboard.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import LoginForm from './LoginForm'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>
}

// Map the small set of internal error codes we redirect with to user-friendly copy.
function errorMessage(code: string | undefined): string | null {
  if (!code) return null
  switch (code) {
    case 'not_authorized':
      return 'Your account exists but is not authorized for the admin panel. Contact Mark to get access.'
    case 'callback_failed':
      return 'Sign-in link could not be verified. It may have expired — request a new one.'
    case 'missing_code':
      return 'Sign-in link was missing required information. Request a new one.'
    default:
      return decodeURIComponent(code)
  }
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // If they already have a session AND an active admin row, skip the login.
  // We don't auto-redirect just on auth-only sessions because the layout would
  // bounce them right back here with not_authorized — better to show the
  // error message inline.
  if (user) {
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, active')
      .eq('auth_user_id', user.id)
      .maybeSingle<{ id: string; active: boolean }>()

    if (adminUser && adminUser.active) {
      redirect(next ?? '/admin')
    }
  }

  return (
    <div className="min-h-screen bg-asphalt-dark grid-bg flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-10">
          <Link href="/" className="block mb-6" aria-label="Back to public site">
            <Image
              src="/assets/mclogoSHADOW.png"
              alt="MC Racing Sim Fort Wayne"
              width={160}
              height={45}
              className="h-12 w-auto"
              priority
            />
          </Link>
          <h1 className="racing-headline text-4xl text-grid-white text-center">
            Pit Crew <span className="text-apex-red">Sign In</span>
          </h1>
          <p className="telemetry-text text-xs text-pit-gray uppercase tracking-widest mt-3">
            Authorized staff only
          </p>
        </div>

        {/* Form card */}
        <div className="bg-asphalt-light/50 backdrop-blur-sm border border-white/10 p-8">
          <LoginForm initialError={errorMessage(error)} />
        </div>

        {/* Footer link */}
        <p className="text-center mt-6">
          <Link
            href="/"
            className="telemetry-text text-xs text-pit-gray uppercase tracking-wider hover:text-apex-red transition-colors"
          >
            &larr; Back to public site
          </Link>
        </p>
      </div>
    </div>
  )
}
