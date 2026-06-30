// POST /api/resend/webhook
// Resend → us. Delivery / open / bounce / complaint events.
//
// Why this matters for deliverability:
//   - A BOUNCE means the address is dead. Keep mailing it and mailbox providers
//     read you as a spammer. We suppress the customer on first hard bounce.
//   - A COMPLAINT (recipient hit "spam") is the most damaging signal there is.
//     We suppress AND unsubscribe immediately and permanently.
//   - DELIVERED / OPENED feed the campaign stats shown in the admin panel.
//
// Resend signs webhooks with Svix. We verify the signature (same trust-nothing
// rule as the Stripe webhook) before acting. Replays are safe: status changes
// are monotonic and campaign counters are recomputed from scratch each time.
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

type SendStatus = Database['public']['Enums']['send_status']

// Monotonic ordering for positive lifecycle events so out-of-order webhooks
// can't downgrade a row (a late "delivered" must not clobber an "opened").
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
}

// --- Svix signature verification -------------------------------------------
function verifySvix(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Secret looks like "whsec_<base64>"; the bytes after the prefix are the key.
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let keyBytes: Buffer
  try {
    keyBytes = Buffer.from(secretKey, 'base64')
  } catch {
    return false
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(signedContent)
    .digest('base64')

  // Header is space-separated "v1,<sig>" pairs; any match passes.
  const provided = svixSignature.split(' ').map((p) => p.split(',')[1] ?? p)
  const expectedBuf = Buffer.from(expected)
  return provided.some((sig) => {
    const sigBuf = Buffer.from(sig)
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    )
  })
}

interface ResendEvent {
  type?: string
  data?: { email_id?: string; to?: string[] | string }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify when a secret is configured. If it isn't yet (initial setup), we
  // still process but log loudly so it doesn't silently stay unverified.
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    if (!verifySvix(rawBody, request.headers, secret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else {
    console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET not set — processing unverified')
  }

  let event: ResendEvent
  try {
    event = JSON.parse(rawBody) as ResendEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = event.type ?? ''
  const emailId = event.data?.email_id
  if (!emailId) {
    // Nothing to correlate — ack so Resend stops retrying.
    return NextResponse.json({ received: true, ignored: 'no email_id' })
  }

  const supabase = createAdminClient()

  // Find the marketing send this event refers to.
  const { data: send } = await supabase
    .from('marketing_sends')
    .select('id, campaign_id, customer_id, status')
    .eq('resend_message_id', emailId)
    .maybeSingle()

  if (!send) {
    // Could be a transactional email (logged elsewhere) — not our concern here.
    return NextResponse.json({ received: true, ignored: 'no matching send' })
  }

  const nowIso = new Date().toISOString()
  let newStatus: SendStatus | null = null
  let suppressCustomer: 'bounce' | 'complaint' | null = null

  switch (type) {
    case 'email.delivered':
      newStatus = 'delivered'
      break
    case 'email.opened':
      newStatus = 'opened'
      break
    case 'email.clicked':
      newStatus = 'clicked'
      break
    case 'email.bounced':
      newStatus = 'bounced'
      suppressCustomer = 'bounce'
      break
    case 'email.complained':
      newStatus = 'complained'
      suppressCustomer = 'complaint'
      break
    default:
      // sent / delivery_delayed / etc. — ack, nothing to change.
      return NextResponse.json({ received: true, ignored: type })
  }

  // Apply the status change with monotonic protection for positive events.
  const isNegative = newStatus === 'bounced' || newStatus === 'complained'
  const currentRank = STATUS_RANK[send.status] ?? 0
  const newRank = STATUS_RANK[newStatus] ?? 0
  const shouldUpdate =
    isNegative || (send.status !== 'bounced' && send.status !== 'complained' && newRank > currentRank)

  if (shouldUpdate) {
    await supabase
      .from('marketing_sends')
      .update({ status: newStatus })
      .eq('id', send.id)
  }

  // Suppress the customer so we never email them again.
  if (suppressCustomer && send.customer_id) {
    const patch: Database['public']['Tables']['customers']['Update'] =
      suppressCustomer === 'bounce'
        ? { email_bounced_at: nowIso }
        : { email_complained_at: nowIso, unsubscribed_at: nowIso }
    await supabase.from('customers').update(patch).eq('id', send.customer_id)
  }

  // Recompute campaign counters from the send rows (idempotent under replays).
  if (send.campaign_id) {
    await recomputeCampaignCounts(supabase, send.campaign_id)
  }

  return NextResponse.json({ received: true })
}

async function recomputeCampaignCounts(
  supabase: ReturnType<typeof createAdminClient>,
  campaignId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from('marketing_sends')
    .select('status')
    .eq('campaign_id', campaignId)

  const counts = {
    sent: 0,
    delivered: 0,
    opened: 0,
    bounced: 0,
    complained: 0,
  }
  for (const r of rows ?? []) {
    const s = r.status
    // "sent" tallies every message we successfully handed to Resend.
    if (s === 'sent' || s === 'delivered' || s === 'opened' || s === 'clicked') {
      counts.sent++
    }
    if (s === 'delivered' || s === 'opened' || s === 'clicked') counts.delivered++
    if (s === 'opened' || s === 'clicked') counts.opened++
    if (s === 'bounced') counts.bounced++
    if (s === 'complained') counts.complained++
  }

  await supabase
    .from('marketing_campaigns')
    .update({
      sent_count: counts.sent,
      delivered_count: counts.delivered,
      opened_count: counts.opened,
      bounced_count: counts.bounced,
      complained_count: counts.complained,
    })
    .eq('id', campaignId)
}
