// POST /api/hold-card/[token]/create-intent
// Public: the require-card invite's "save your card" page calls this to get a
// SetupIntent client_secret. The customer is actively consenting to the no-show
// policy by proceeding, so we stamp the consent snapshot here. No charge is made
// — the card is only saved; the setup_intent.succeeded webhook confirms the
// booking (finalizeConfirmedBooking).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createAdminClient()
  const stripe = getStripe()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, stripe_payment_method_id, stripe_setup_intent_id, customer_id, consent_text')
    .eq('card_link_token', token)
    .maybeSingle()

  if (!booking) {
    return NextResponse.json({ success: false, error: 'This link is not valid.' }, { status: 400 })
  }
  if (booking.stripe_payment_method_id) {
    return NextResponse.json({ success: false, error: 'A card is already on file for this booking.' }, { status: 400 })
  }
  // Only a still-pending invite may accept a card. Guards against a stale link
  // being used after the booking was cancelled/settled — which would otherwise
  // attach a chargeable card + fresh consent to a dead booking.
  if (booking.status !== 'pending') {
    return NextResponse.json(
      { success: false, error: 'This booking is no longer awaiting a card.' },
      { status: 400 }
    )
  }

  // Ensure a Stripe customer.
  const { data: customer } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, stripe_customer_id')
    .eq('id', booking.customer_id)
    .maybeSingle()
  if (!customer) {
    return NextResponse.json({ success: false, error: 'Booking customer not found.' }, { status: 400 })
  }

  let stripeCustomerId = customer.stripe_customer_id ?? undefined
  if (!stripeCustomerId) {
    const sc = await stripe.customers.create({
      email: customer.email ?? undefined,
      name: `${customer.first_name} ${customer.last_name}`.trim(),
      metadata: { supabase_customer_id: customer.id },
    })
    stripeCustomerId = sc.id
    await supabase.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', customer.id)
  }

  // Reuse the same idempotency key as the online flow so a retry returns the
  // same SetupIntent rather than creating duplicates.
  const setupIntent = await stripe.setupIntents.create(
    {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { booking_id: booking.id, supabase_customer_id: customer.id },
    },
    { idempotencyKey: `setup-intent-${booking.id}` }
  )

  // Stamp consent (the customer is proceeding to save the card) + correlate the
  // setup intent for the webhook.
  await supabase
    .from('bookings')
    .update({
      stripe_setup_intent_id: setupIntent.id,
      consent_timestamp: new Date().toISOString(),
      consent_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      consent_user_agent: request.headers.get('user-agent') ?? null,
    })
    .eq('id', booking.id)

  if (!setupIntent.client_secret) {
    return NextResponse.json({ success: false, error: 'Could not start card setup.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    clientSecret: setupIntent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  })
}
