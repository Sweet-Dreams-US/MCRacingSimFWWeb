// Party / group-event bookings with a 50% online deposit.
//
// Unlike the standard booking flow (a $0 SetupIntent card-on-file charged later
// on no-show), a party takes a REAL up-front charge: the invitee pays half the
// admin-quoted total online to confirm, and the balance is collected in person.
// The deposit amount is ALWAYS computed server-side from the DB row — a
// browser-supplied amount is never trusted.
import { createAdminClient } from './supabase/admin'
import { getStripe } from './stripe'
import { findOrCreateCustomerIdByEmail } from './customers'
import { sendEmail, getOwnerNotificationEmail } from './email'
import { partyDepositInviteEmail, ownerNewPartyEmail } from './emails/templates'
import { computeDepositCents, type PartyType } from './parties-shared'

// Re-export the client-safe helpers so existing server imports of '@/lib/parties'
// keep working.
export {
  PARTY_TYPES,
  PARTY_TYPE_LABELS,
  isPartyType,
  partyTypeLabel,
  computeDepositCents,
  type PartyType,
} from './parties-shared'

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function partyCode(): string {
  let out = ''
  for (let i = 0; i < 5; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return `PARTY-${out}`
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_URL || 'https://mcracingfortwayne.com'
}

export interface CreatePartyInviteInput {
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  partyType: PartyType
  sessionDate: string // "YYYY-MM-DD"
  startTime: string // "HH:MM"
  headcount: number
  totalPriceCents: number
  notes?: string | null
  createdByUserId?: string | null
}

export interface CreatePartyInviteResult {
  partyId: string
  publicToken: string
  payUrl: string
  depositCents: number
}

export async function createPartyInvite(
  input: CreatePartyInviteInput
): Promise<CreatePartyInviteResult> {
  const supabase = createAdminClient()
  const email = input.contactEmail.trim().toLowerCase()
  const depositCents = computeDepositCents(input.totalPriceCents)

  // Link to a customer record (find-or-create) so the party shows on their
  // history; contact fields are also snapshotted on the party row.
  const customerId = await findOrCreateCustomerIdByEmail(supabase, email)

  const row = {
    customer_id: customerId,
    contact_name: input.contactName.trim(),
    contact_email: email,
    contact_phone: input.contactPhone?.trim() || null,
    party_type: input.partyType,
    session_date: input.sessionDate,
    start_time: input.startTime,
    headcount: input.headcount,
    total_price_cents: input.totalPriceCents,
    deposit_cents: depositCents,
    notes: input.notes?.trim() || null,
    created_by_user_id: input.createdByUserId ?? null,
  }

  let partyId = ''
  let publicToken = ''
  let inserted = false
  for (let attempt = 0; attempt < 25 && !inserted; attempt++) {
    partyId = partyCode()
    const { data, error } = await supabase
      .from('party_bookings')
      .insert({ id: partyId, ...row })
      .select('id, public_token')
      .single()
    if (!error && data) {
      inserted = true
      publicToken = data.public_token
      break
    }
    if (error && error.code !== '23505') {
      throw new Error(`Party insert failed: ${error.message}`)
    }
  }
  if (!inserted) throw new Error('Could not generate a unique party code — please try again.')

  const payUrl = `${baseUrl()}/party/${publicToken}`

  // Invite email to the customer + owner alert. Best-effort (sendEmail never throws).
  const invite = partyDepositInviteEmail({
    contactName: input.contactName,
    partyType: input.partyType,
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    headcount: input.headcount,
    totalPriceCents: input.totalPriceCents,
    depositCents,
    payUrl,
  })
  await sendEmail({
    to: email,
    subject: invite.subject,
    html: invite.html,
    template: 'party_deposit_invite',
    relatedCustomerId: customerId,
  })

  const owner = ownerNewPartyEmail({
    partyId,
    contactName: input.contactName,
    contactEmail: email,
    contactPhone: input.contactPhone ?? null,
    partyType: input.partyType,
    sessionDate: input.sessionDate,
    startTime: input.startTime,
    headcount: input.headcount,
    totalPriceCents: input.totalPriceCents,
    depositCents,
  })
  await sendEmail({
    to: getOwnerNotificationEmail(),
    subject: owner.subject,
    html: owner.html,
    template: 'owner_new_party',
  })

  return { partyId, publicToken, payUrl, depositCents }
}

/**
 * Create (or reuse) the Stripe PaymentIntent for a party's deposit and return
 * its client_secret for the public pay page. Amount is ALWAYS the DB deposit —
 * never a client-supplied value. Idempotent per party.
 */
export async function createPartyDepositIntent(
  publicToken: string
): Promise<{ clientSecret: string; depositCents: number; publishableKey: string | undefined }> {
  const supabase = createAdminClient()
  const stripe = getStripe()

  const { data: party } = await supabase
    .from('party_bookings')
    .select(
      'id, customer_id, contact_name, contact_email, deposit_cents, deposit_status, party_type, stripe_customer_id'
    )
    .eq('public_token', publicToken)
    .maybeSingle()

  if (!party) throw new PartyError('This deposit link is not valid.')
  if (party.deposit_status === 'paid') throw new PartyError('This deposit has already been paid.')

  const depositCents = party.deposit_cents // authoritative server value

  // Ensure a Stripe customer for the receipt + saved association.
  let stripeCustomerId = party.stripe_customer_id ?? undefined
  if (!stripeCustomerId && party.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('stripe_customer_id, email, first_name, last_name')
      .eq('id', party.customer_id)
      .maybeSingle()
    stripeCustomerId = c?.stripe_customer_id ?? undefined
    if (!stripeCustomerId) {
      const sc = await stripe.customers.create({
        email: c?.email ?? party.contact_email,
        name: party.contact_name,
        metadata: { supabase_customer_id: party.customer_id },
      })
      stripeCustomerId = sc.id
      await supabase.from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', party.customer_id)
    }
  }
  if (!stripeCustomerId) {
    const sc = await stripe.customers.create({ email: party.contact_email, name: party.contact_name })
    stripeCustomerId = sc.id
  }

  const idempotencyKey = `party-deposit-${party.id}`
  const intent = await stripe.paymentIntents.create(
    {
      amount: depositCents,
      currency: 'usd',
      payment_method_types: ['card'],
      capture_method: 'automatic',
      customer: stripeCustomerId,
      receipt_email: party.contact_email,
      description: `Party deposit — ${party.id}`,
      metadata: {
        source: 'party_deposit',
        sale_type: 'party_deposit',
        party_id: party.id,
      },
    },
    { idempotencyKey }
  )

  // Pending charge row (the webhook flips it to succeeded + records the
  // transaction). UPSERT on the stable idempotency_key rather than insert-if-new:
  // if the invitee reloads after Stripe's idempotency key expires (~24h), Stripe
  // mints a NEW intent id — we must REBIND the existing charge row to that new
  // id, not insert a duplicate (which would collide on the UNIQUE key and leave
  // the row pointing at the dead intent, so the webhook could never match it).
  const { error: chargeErr } = await supabase
    .from('stripe_charges')
    .upsert(
      {
        stripe_payment_intent_id: intent.id,
        customer_id: party.customer_id,
        amount_cents: depositCents,
        currency: 'usd',
        status: 'pending',
        payment_method_type: 'stripe_online',
        reason: `Party deposit — ${party.id}`,
        idempotency_key: idempotencyKey,
      },
      { onConflict: 'idempotency_key' }
    )
  if (chargeErr) {
    throw new Error(`Could not record the deposit charge: ${chargeErr.message}`)
  }

  await supabase
    .from('party_bookings')
    .update({ stripe_payment_intent_id: intent.id, stripe_customer_id: stripeCustomerId })
    .eq('id', party.id)

  if (!intent.client_secret) throw new Error('Stripe returned no client_secret for the deposit.')

  return {
    clientSecret: intent.client_secret,
    depositCents,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  }
}

/**
 * Called from the Stripe webhook when a party-deposit PaymentIntent succeeds.
 * Confirms the party, records the deposit as a transaction (idempotent), and
 * emails the customer their confirmation. Best-effort + safe to re-run.
 */
export async function finalizePartyDeposit(opts: {
  partyId: string
  chargeRowId: string
  capturedAmountCents: number
}): Promise<void> {
  const supabase = createAdminClient()

  // Confirm the party — only the first pending→paid transition takes effect.
  await supabase
    .from('party_bookings')
    .update({ deposit_status: 'paid', status: 'confirmed', paid_at: new Date().toISOString() })
    .eq('id', opts.partyId)
    .eq('deposit_status', 'pending')

  // Record the deposit as revenue, unless a transaction already references this
  // charge (idempotency against webhook retries).
  const { count } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('stripe_charge_id', opts.chargeRowId)
  if (!count) {
    const todayEastern = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const { data: charge } = await supabase
      .from('stripe_charges')
      .select('customer_id')
      .eq('id', opts.chargeRowId)
      .maybeSingle()
    await supabase.from('transactions').insert({
      type: 'party_deposit',
      amount_cents: opts.capturedAmountCents,
      occurred_on: todayEastern,
      description: `Party deposit — ${opts.partyId}`,
      customer_id: charge?.customer_id ?? null,
      stripe_charge_id: opts.chargeRowId,
      payment_method: 'stripe_online',
    })
  }

  // Confirmation email to the customer (best-effort).
  try {
    const { data: party } = await supabase
      .from('party_bookings')
      .select('contact_name, contact_email, party_type, session_date, start_time, deposit_cents, total_price_cents')
      .eq('id', opts.partyId)
      .maybeSingle()
    if (party) {
      const { partyConfirmedEmail } = await import('./emails/templates')
      const { subject, html } = partyConfirmedEmail({
        contactName: party.contact_name,
        partyType: party.party_type,
        sessionDate: party.session_date,
        startTime: party.start_time,
        depositCents: party.deposit_cents,
        totalPriceCents: party.total_price_cents,
      })
      await sendEmail({ to: party.contact_email, subject, html, template: 'party_confirmed' })
    }
  } catch (err) {
    console.error(`finalizePartyDeposit: confirmation email failed for ${opts.partyId}:`, err)
  }
}

/** Thrown for invitee-facing problems (bad token, already paid). */
export class PartyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PartyError'
  }
}
