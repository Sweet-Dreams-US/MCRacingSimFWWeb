// POST /api/party/[token]/create-intent
// Public: the invitee's deposit page calls this to get a PaymentIntent
// client_secret. The amount is recomputed server-side from the party row —
// never trusted from the browser.
import { NextRequest, NextResponse } from 'next/server'
import { createPartyDepositIntent, PartyError } from '@/lib/parties'

export const runtime = 'nodejs'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  try {
    const result = await createPartyDepositIntent(token)
    return NextResponse.json({
      success: true,
      clientSecret: result.clientSecret,
      depositCents: result.depositCents,
      publishableKey: result.publishableKey,
    })
  } catch (err) {
    if (err instanceof PartyError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    console.error('Party deposit intent error:', err)
    return NextResponse.json(
      { success: false, error: 'Could not start the deposit. Please try again or call (808) 220-2600.' },
      { status: 500 }
    )
  }
}
