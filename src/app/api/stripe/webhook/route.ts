// POST /api/stripe/webhook
// Stripe → us. Signed by Stripe with our webhook secret.
//
// TODO (Phase 7a follow-up): build src/app/api/resend/webhook/route.ts to
// handle Resend's delivery / bounce / complaint events. That handler will
// update email_log.status (e.g. 'delivered', 'bounced', 'complained') so
// the admin panel can show real delivery state per message. Resend signs
// its webhooks with Svix &mdash; verify the signature before trusting the
// payload, same idempotency pattern as below.
//
// Critical design points:
//   1. SIGNATURE FIRST — never trust the request body until the
//      signature has been verified. Forged events could create
//      bookings, mark payments, anything.
//   2. IDEMPOTENT — every event has a unique stripe_event_id.
//      We insert it into stripe_webhook_events before processing;
//      if the insert conflicts, we've already seen this event
//      and can safely no-op (Stripe retries on 5xx + timeouts).
//   3. ACK FAST — Stripe times out at 30s and retries on timeout.
//      Do the minimum here and queue anything expensive.
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeConfirmedBooking } from '@/lib/booking'
import type { Json } from '@/lib/supabase/types'

// Force Node.js runtime — Stripe SDK + crypto for signature verification
// need full Node, not Edge.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured')
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500 }
    )
  }

  // ---- 1. Verify signature (with raw body) --------------------------------
  // Stripe needs the RAW request body to verify the signature — not the
  // JSON-parsed object. Next.js gives us text() which is the raw text.
  const rawBody = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Webhook signature verification failed: ${message}`)
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 400 }
    )
  }

  // ---- 2. Idempotency: insert event row; if conflict, already processed --
  const supabase = createAdminClient()

  const { error: insertError } = await supabase
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      // Stripe event payloads are JSON-serializable but TypeScript doesn't
      // know that without an assertion. The data round-trips cleanly through
      // jsonb because Stripe only sends primitives + nested objects.
      payload: event.data.object as unknown as Json,
    })

  if (insertError) {
    // 23505 = unique_violation — we've seen this event before. Return 200
    // so Stripe stops retrying.
    if (
      insertError.code === '23505' ||
      insertError.message?.includes('duplicate')
    ) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    // Other DB errors: return 500 so Stripe retries.
    console.error(
      `Failed to record webhook event ${event.id}: ${insertError.message}`
    )
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // ---- 3. Dispatch by event type ------------------------------------------
  try {
    await processEvent(event, supabase)

    // Mark processed
    await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('stripe_event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    console.error(`Error processing event ${event.id} (${event.type}): ${message}`)
    // Record the error so we can replay later from the events table.
    await supabase
      .from('stripe_webhook_events')
      .update({ error: message })
      .eq('stripe_event_id', event.id)
    // Return 500 — Stripe will retry, but our processed_at check stops
    // duplicate side-effects.
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

type Supa = ReturnType<typeof createAdminClient>

async function processEvent(event: Stripe.Event, supabase: Supa) {
  switch (event.type) {
    case 'setup_intent.succeeded':
      return handleSetupIntentSucceeded(event, supabase)

    case 'setup_intent.setup_failed':
      return handleSetupIntentFailed(event, supabase)

    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event, supabase)

    case 'payment_intent.payment_failed':
      return handlePaymentIntentFailed(event, supabase)

    case 'charge.dispute.created':
      return handleDisputeCreated(event, supabase)

    default:
      // Lots of events fire that we don't act on (customer.updated, etc.).
      // We've already logged them in stripe_webhook_events; that's enough.
      return
  }
}

async function handleSetupIntentSucceeded(event: Stripe.Event, supabase: Supa) {
  const setupIntent = event.data.object as Stripe.SetupIntent
  const bookingId = setupIntent.metadata?.booking_id
  const paymentMethodId =
    typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  if (!bookingId || !paymentMethodId) {
    throw new Error(
      `setup_intent.succeeded missing metadata.booking_id or payment_method: ` +
        `intent=${setupIntent.id} booking=${bookingId} pm=${paymentMethodId}`
    )
  }

  const { error } = await supabase
    .from('bookings')
    .update({ stripe_payment_method_id: paymentMethodId })
    .eq('id', bookingId)

  if (error) {
    throw new Error(
      `Failed to attach payment method to booking ${bookingId}: ${error.message}`
    )
  }

  // Card is now genuinely on file → promote the booking from pending to
  // confirmed AND fire the confirmation/owner/friend emails + calendar event.
  // This is the correct moment for those side effects — NOT at booking
  // creation, when no card had been submitted yet. finalizeConfirmedBooking
  // is idempotent (no-ops if already confirmed) so a retried webhook won't
  // send duplicate confirmations.
  await finalizeConfirmedBooking(bookingId)
}

async function handleSetupIntentFailed(event: Stripe.Event, supabase: Supa) {
  const setupIntent = event.data.object as Stripe.SetupIntent
  const bookingId = setupIntent.metadata?.booking_id
  // We don't delete the booking — staff can follow up with the customer.
  // Just leave stripe_payment_method_id null. Mark could decide to cancel
  // or contact them; the admin UI can show "card setup failed" badge.
  console.warn(
    `SetupIntent failed for booking ${bookingId}: ${setupIntent.last_setup_error?.message ?? 'unknown'}`
  )
  void supabase // silence "unused" if no DB work needed for this case
}

async function handlePaymentIntentSucceeded(event: Stripe.Event, supabase: Supa) {
  const intent = event.data.object as Stripe.PaymentIntent

  // Flip our charge row to succeeded.
  const { data: charge, error: chargeError } = await supabase
    .from('stripe_charges')
    .update({ status: 'succeeded' })
    .eq('stripe_payment_intent_id', intent.id)
    .select('id, amount_cents, booking_id, customer_id')
    .maybeSingle()

  if (chargeError) {
    throw new Error(
      `Failed to update stripe_charges to succeeded for ${intent.id}: ${chargeError.message}`
    )
  }

  // For in-person POS (Terminal) charges, the webhook is the source of truth
  // for recording the accounting transaction — the customer might still be
  // tapping when the POS tab closes, so we can't rely on the UI to record it.
  // Idempotent: only insert if no transaction already references this charge.
  if (intent.metadata?.source === 'pos' && charge) {
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('stripe_charge_id', charge.id)

    if (!count) {
      const saleType =
        intent.metadata.sale_type === 'booking_income'
          ? 'booking_income'
          : intent.metadata.sale_type === 'other_income'
            ? 'other_income'
            : 'in_person_sale'
      const todayEastern = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())

      await supabase.from('transactions').insert({
        type: saleType,
        amount_cents: charge.amount_cents, // positive — money in
        occurred_on: todayEastern,
        description: intent.description || 'In-person sale (Terminal)',
        booking_id: charge.booking_id,
        customer_id: charge.customer_id,
        stripe_charge_id: charge.id,
        payment_method: 'stripe_terminal',
        created_by_user_id: intent.metadata.admin_user_id || null,
      })
    }
  }

  // No-show charges are recorded by the admin action that created them, so we
  // don't double-insert here for those.
}

async function handlePaymentIntentFailed(event: Stripe.Event, supabase: Supa) {
  const intent = event.data.object as Stripe.PaymentIntent
  const { error } = await supabase
    .from('stripe_charges')
    .update({
      status: 'failed',
      decline_code: intent.last_payment_error?.decline_code ?? null,
      failure_message: intent.last_payment_error?.message ?? null,
    })
    .eq('stripe_payment_intent_id', intent.id)

  if (error) {
    throw new Error(
      `Failed to update stripe_charges to failed for ${intent.id}: ${error.message}`
    )
  }
  // TODO Phase 7a: send email alert to OWNER_NOTIFICATION_EMAIL so Mark knows
  // to follow up on the no-show charge that didn't go through.
}

async function handleDisputeCreated(event: Stripe.Event, supabase: Supa) {
  const dispute = event.data.object as Stripe.Dispute
  console.error(
    `🚨 Stripe dispute created: ${dispute.id} for charge ${dispute.charge} ` +
      `amount=${dispute.amount} reason=${dispute.reason}`
  )
  // TODO Phase 7a: send urgent email to OWNER_NOTIFICATION_EMAIL with the
  // dispute details + a link to the consent snapshot for the related booking.
  void supabase
}
