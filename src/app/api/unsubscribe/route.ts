// /api/unsubscribe?token=... — the machine endpoint named in the
// List-Unsubscribe header.
//
// POST = RFC 8058 one-click unsubscribe. Gmail / Apple Mail POST here directly
// when a recipient taps the native "Unsubscribe" button. It must unsubscribe
// WITHOUT any further interaction and return 200. No auth — the unguessable
// UUID token is the credential.
//
// GET = a stray click on the header link in some clients; bounce it to the
// friendly confirmation page.
import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeByToken } from '@/lib/marketing/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const result = await unsubscribeByToken(token)

  // Always 200 for a recognized token (even if already unsubscribed) so the
  // mail client shows success. Unknown token → 400.
  if (!result.ok && result.error === 'Unknown unsubscribe link') {
    return new NextResponse('Unknown unsubscribe link', { status: 400 })
  }
  if (!result.ok) {
    return new NextResponse(result.error ?? 'Error', { status: 500 })
  }
  return new NextResponse('You have been unsubscribed.', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const url = new URL('/unsubscribe/', request.nextUrl.origin)
  if (token) url.searchParams.set('token', token)
  return NextResponse.redirect(url)
}
