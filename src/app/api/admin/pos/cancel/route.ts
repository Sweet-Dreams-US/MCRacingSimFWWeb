// POST /api/admin/pos/cancel
// Cancel the in-progress reader action (manager hit cancel before the
// customer tapped) and cancel the PaymentIntent so nothing settles.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { cancelReaderAction } from '@/lib/terminal'

export const runtime = 'nodejs'

interface CancelBody {
  paymentIntentId: string
  readerId: string
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    throw err
  }

  const { paymentIntentId, readerId } = (await request.json()) as CancelBody
  const stripe = getStripe()
  const supabase = createAdminClient()

  // Cancel the reader action first (best effort — it may have already finished)
  if (readerId) {
    try {
      await cancelReaderAction(readerId)
    } catch {
      /* reader may have no action in progress — ignore */
    }
  }

  // Cancel the PaymentIntent so it never captures
  try {
    await stripe.paymentIntents.cancel(paymentIntentId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json(
      { success: false, error: `Could not cancel: ${message}` },
      { status: 409 }
    )
  }

  // Mark our pending charge row as failed (cancelled)
  await supabase
    .from('stripe_charges')
    .update({ status: 'failed', failure_message: 'Cancelled at the reader' })
    .eq('stripe_payment_intent_id', paymentIntentId)

  return NextResponse.json({ success: true })
}
