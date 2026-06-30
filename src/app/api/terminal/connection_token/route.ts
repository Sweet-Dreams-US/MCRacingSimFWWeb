// POST /api/terminal/connection_token
// The on-reader app calls this (via its ConnectionTokenProvider) to get a
// Stripe Terminal connection token. Device-key protected.
import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { isDeviceAuthorized } from '@/lib/device-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const stripe = getStripe()
    const token = await stripe.terminal.connectionTokens.create()
    return NextResponse.json({ secret: token.secret })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create token' },
      { status: 502 }
    )
  }
}
