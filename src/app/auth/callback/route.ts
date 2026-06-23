// Magic-link callback — Supabase redirects the user here with ?code=... after
// they click the email link. We exchange that code for a real session cookie,
// then forward them into the admin panel (or whatever ?next= path was set).
//
// On failure we kick back to /admin/login with an error code so the user knows
// the link was bad/expired instead of just landing on an empty page.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // 'next' lets middleware preserve the originally-requested URL through the
  // login round-trip. Default to /admin if not provided.
  const next = searchParams.get('next') ?? '/admin'

  if (!code) {
    return NextResponse.redirect(`${origin}/admin/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/admin/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // Only forward to internal paths — never let an external 'next' value redirect
  // off-site (open-redirect vector).
  const safeNext = next.startsWith('/') ? next : '/admin'
  return NextResponse.redirect(`${origin}${safeNext}`)
}
