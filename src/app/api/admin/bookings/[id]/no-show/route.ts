// POST /api/admin/bookings/[id]/no-show
//
// Admin marks some or all racers as no-shows. We compute the charge
// (= no_show_count × $20) and attempt an off-session PaymentIntent
// against the card-on-file. The result might be:
//   - succeeded (money captured)
//   - failed (declined, insufficient funds, etc.)
//   - requires_action (card needs 3DS — can't complete off-session)
//
// The booking's status moves to 'partial_noshow' or 'noshow' based on whether
// ALL racers no-showed. The stripe_charges row records the attempt regardless
// of outcome so admins can retry failed charges from the booking detail page.
//
// Critical correctness properties:
//   - Idempotency: idempotency_key = `noshow-${bookingId}-${attempt}` so a
//     retried request never double-charges.
//   - All money paths insert a stripe_charges row, even on failure.
//   - On success, also insert a transaction row (single source of truth for
//     accounting). Webhook will sync status, but transaction insert is here
//     because the admin's intent is what creates the transaction record.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { onBookingCompleted } from '@/lib/booking'
import { NO_SHOW_FEE_CENTS_PER_SEAT } from '@/lib/pricing'

export const runtime = 'nodejs'

interface NoShowRequestBody {
  // Slots that no-showed (subset of [1, 2, 3]).
  // Empty array = nobody no-showed (effectively a cancel-the-no-show action).
  noShowSlots: number[]
  // Optional admin note
  notes?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ---- Auth ---------------------------------------------------------------
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const { id: bookingId } = await params
  const body = (await request.json()) as NoShowRequestBody

  if (!Array.isArray(body.noShowSlots)) {
    return NextResponse.json(
      { success: false, error: 'noShowSlots must be an array of slot numbers' },
      { status: 400 }
    )
  }

  const noShowCount = body.noShowSlots.length

  const supabase = createAdminClient()

  // ---- Fetch the booking -------------------------------------------------
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, racer_count, stripe_payment_method_id, customer_id, no_show_fee_cents, status')
    .eq('id', bookingId)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json(
      { success: false, error: 'Booking not found' },
      { status: 404 }
    )
  }

  // ---- Validate slot numbers ---------------------------------------------
  const invalidSlots = body.noShowSlots.filter(
    (s) => s < 1 || s > booking.racer_count
  )
  if (invalidSlots.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid slot numbers for a ${booking.racer_count}-racer booking: ${invalidSlots.join(', ')}`,
      },
      { status: 400 }
    )
  }

  // ---- Update booking_racers.showed_up ------------------------------------
  // Slots in noShowSlots → showed_up=false, all others → showed_up=true
  const allSlots = Array.from({ length: booking.racer_count }, (_, i) => i + 1)
  const showedSlots = allSlots.filter((s) => !body.noShowSlots.includes(s))

  if (body.noShowSlots.length > 0) {
    const { error: noShowError } = await supabase
      .from('booking_racers')
      .update({ showed_up: false })
      .eq('booking_id', bookingId)
      .in('slot', body.noShowSlots)
    if (noShowError) {
      return NextResponse.json(
        { success: false, error: `Failed to mark no-show: ${noShowError.message}` },
        { status: 500 }
      )
    }
  }
  if (showedSlots.length > 0) {
    const { error: showedError } = await supabase
      .from('booking_racers')
      .update({ showed_up: true })
      .eq('booking_id', bookingId)
      .in('slot', showedSlots)
    if (showedError) {
      return NextResponse.json(
        { success: false, error: `Failed to mark showed: ${showedError.message}` },
        { status: 500 }
      )
    }
  }

  // ---- Update booking status ---------------------------------------------
  const newStatus =
    noShowCount === 0
      ? 'completed'
      : noShowCount === booking.racer_count
        ? 'noshow'
        : 'partial_noshow'

  await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId)

  // If nobody no-showed, the session completed cleanly — fire the thank-you
  // email + first-timer referral (idempotent, best-effort) and we're done.
  if (noShowCount === 0) {
    await onBookingCompleted(bookingId)
    return NextResponse.json({
      success: true,
      noShowCount: 0,
      status: newStatus,
      charge: null,
    })
  }

  // ---- Charge the card on file --------------------------------------------
  if (!booking.stripe_payment_method_id) {
    // Walk-in booking with no card — can't charge anything. Status is updated
    // but the no-show fee will need to be collected in person.
    return NextResponse.json({
      success: true,
      noShowCount,
      status: newStatus,
      charge: null,
      note: 'No card on file — collect no-show fee in person.',
    })
  }

  const chargeAmountCents = noShowCount * NO_SHOW_FEE_CENTS_PER_SEAT
  const stripe = getStripe()

  // Count existing charges for this booking to derive an attempt number
  // for the idempotency key. First attempt = '1', retries get incrementing IDs.
  const { count: priorChargeCount } = await supabase
    .from('stripe_charges')
    .select('*', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
  const attempt = (priorChargeCount ?? 0) + 1
  const idempotencyKey = `noshow-${bookingId}-attempt-${attempt}`

  let intent: Stripe.PaymentIntent
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: chargeAmountCents,
        currency: 'usd',
        customer: await getStripeCustomerId(supabase, booking.customer_id),
        payment_method: booking.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `MC Racing no-show fee — ${bookingId} (${noShowCount} of ${booking.racer_count})`,
        metadata: {
          booking_id: bookingId,
          no_show_count: String(noShowCount),
          attempt: String(attempt),
        },
      },
      { idempotencyKey }
    )
  } catch (err) {
    // Stripe throws on declines, etc. Pull the PaymentIntent from the error
    // so we still record the attempt.
    const stripeErr = err as Stripe.errors.StripeCardError
    intent = stripeErr.payment_intent as Stripe.PaymentIntent
    if (!intent) {
      // Truly unexpected — couldn't even create the intent
      console.error('Stripe noshow charge failed without intent:', err)
      return NextResponse.json(
        {
          success: false,
          error: 'Card charge failed before reaching Stripe — please retry.',
          stripeError: stripeErr.message,
        },
        { status: 500 }
      )
    }
  }

  // Map Stripe status → our charge_status enum
  const chargeStatus =
    intent.status === 'succeeded'
      ? 'succeeded'
      : intent.status === 'requires_action'
        ? 'requires_action'
        : 'failed'

  const declineCode = intent.last_payment_error?.decline_code ?? null
  const failureMessage = intent.last_payment_error?.message ?? null

  // ---- Insert the stripe_charges row (always, regardless of outcome) ------
  const { data: chargeRow, error: chargeInsertError } = await supabase
    .from('stripe_charges')
    .insert({
      stripe_payment_intent_id: intent.id,
      booking_id: bookingId,
      customer_id: booking.customer_id,
      amount_cents: chargeAmountCents,
      currency: 'usd',
      status: chargeStatus,
      payment_method_type: 'stripe_online',
      stripe_payment_method_id: booking.stripe_payment_method_id,
      decline_code: declineCode,
      failure_message: failureMessage,
      reason: `No-show fee — ${noShowCount} of ${booking.racer_count} racers (booking ${bookingId})`,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single()

  if (chargeInsertError || !chargeRow) {
    console.error('Failed to record charge:', chargeInsertError)
    // Money has potentially moved at this point — log loudly. Webhook will
    // also record it via stripe_webhook_events as a backstop.
    return NextResponse.json(
      {
        success: chargeStatus === 'succeeded',
        warning: 'Charge attempted but failed to record. Check Stripe Dashboard.',
        stripeIntentId: intent.id,
        status: newStatus,
      },
      { status: chargeStatus === 'succeeded' ? 200 : 500 }
    )
  }

  // ---- Insert the transaction row on success ------------------------------
  // (Single source of truth for the accounting log. Webhook will not insert
  // a transaction — it only updates stripe_charges.status. Decoupling like
  // this means a missed webhook doesn't lose the transaction; the admin's
  // intent is what creates the record.)
  if (chargeStatus === 'succeeded') {
    const todayEastern = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

    await supabase.from('transactions').insert({
      type: 'no_show_fee',
      amount_cents: chargeAmountCents, // positive — money in
      occurred_on: todayEastern,
      description: `No-show fee — ${noShowCount} of ${booking.racer_count} racers (booking ${bookingId})`,
      booking_id: bookingId,
      customer_id: booking.customer_id,
      stripe_charge_id: chargeRow.id,
      payment_method: 'stripe_online',
      created_by_user_id: adminCtx.admin.id,
    })
  }

  return NextResponse.json({
    success: chargeStatus === 'succeeded',
    noShowCount,
    status: newStatus,
    charge: {
      id: chargeRow.id,
      stripeIntentId: intent.id,
      status: chargeStatus,
      amountCents: chargeAmountCents,
      declineCode,
      failureMessage,
    },
  })
}

// Helper: get the Stripe Customer ID for a Supabase customer
async function getStripeCustomerId(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('customers')
    .select('stripe_customer_id')
    .eq('id', customerId)
    .single()
  if (error || !data?.stripe_customer_id) {
    throw new Error(`Customer ${customerId} has no Stripe Customer attached`)
  }
  return data.stripe_customer_id
}
