// Marketing send engine.
//
// This is deliberately separate from src/lib/email.ts (transactional). Marketing
// mail has different rules:
//   - It MUST carry List-Unsubscribe + List-Unsubscribe-Post headers so Gmail /
//     Apple Mail show a native one-click unsubscribe button. Bulk senders that
//     omit these now get throttled or junked.
//   - It MUST be suppressed for anyone who unsubscribed, bounced, or complained.
//   - It should send from a SEPARATE subdomain so a marketing complaint can't
//     hurt the reputation of booking-confirmation mail.
//   - It sends multipart (HTML + plaintext); HTML-only reads as spam.
//
// Sends are recorded in `marketing_sends` (campaign analytics + webhook match),
// NOT email_log — that table stays transactional-only.

import { Resend } from 'resend'
import { createAdminClient } from '../supabase/admin'
import type { Database } from '../supabase/types'
import {
  applyMergeFields,
  applyMergeFieldsText,
  mergeVarsFor,
  renderMarketingHtml,
  renderMarketingText,
  htmlToPlainText,
  getSiteUrl,
} from './render'

type SupabaseAdmin = ReturnType<typeof createAdminClient>

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// The marketing subdomain. Default points at the dedicated send.* subdomain the
// owner verifies in Resend. Override-able so we can fall back to the main domain
// before the subdomain is verified.
export function getMarketingFrom(): string {
  const name = process.env.MARKETING_FROM_NAME || 'MC Racing Sim Fort Wayne'
  const email =
    process.env.MARKETING_FROM_EMAIL || 'hello@send.mcracingfortwayne.com'
  return `${name} <${email}>`
}

// Replies should reach a real, monitored inbox (the owner's).
function getReplyTo(): string {
  return process.env.MARKETING_REPLY_TO || 'mcracingfortwayne@gmail.com'
}

// Gentle pacing between sends protects a new domain's reputation. Small list,
// so a short delay is plenty and stays well within the function timeout.
const SEND_DELAY_MS = Number(process.env.MARKETING_SEND_DELAY_MS || 120)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Lazy Resend client
// ---------------------------------------------------------------------------

let cachedResend: Resend | null = null
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!cachedResend) cachedResend = new Resend(apiKey)
  return cachedResend
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

// Human-facing unsubscribe page (footer link).
// NOTE: the site runs trailingSlash:true, so we emit the slash BEFORE the query
// string. Without it the request 308-redirects, and the one-click unsubscribe
// bot may not follow the redirect — which would silently break unsubscribe.
export function unsubscribeUrlFor(token: string): string {
  return `${getSiteUrl()}/unsubscribe/?token=${encodeURIComponent(token)}`
}

// Machine endpoint for RFC 8058 one-click unsubscribe (List-Unsubscribe-Post).
export function unsubscribePostUrlFor(token: string): string {
  return `${getSiteUrl()}/api/unsubscribe/?token=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

export interface CustomerForSend {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  unsubscribe_token: string
  unsubscribed_at: string | null
  email_bounced_at: string | null
  email_complained_at: string | null
}

// The single source of truth for "can we legally + safely email this person?"
export function isEmailable(c: CustomerForSend): boolean {
  return (
    !!c.email &&
    c.email.includes('@') &&
    !c.unsubscribed_at &&
    !c.email_bounced_at &&
    !c.email_complained_at
  )
}

const EMAILABLE_COLUMNS =
  'id, first_name, last_name, email, unsubscribe_token, unsubscribed_at, email_bounced_at, email_complained_at'

// Fetch every emailable customer, de-duplicated by email address (families
// share an inbox in our data — we must not hit the same inbox twice).
export async function getEmailableAudience(
  supabase: SupabaseAdmin
): Promise<CustomerForSend[]> {
  const { data, error } = await supabase
    .from('customers')
    .select(EMAILABLE_COLUMNS)
    .not('email', 'is', null)
    .is('unsubscribed_at', null)
    .is('email_bounced_at', null)
    .is('email_complained_at', null)
    .order('last_visit_at', { ascending: false, nullsFirst: false })

  if (error) throw new Error(`getEmailableAudience: ${error.message}`)

  const seen = new Set<string>()
  const deduped: CustomerForSend[] = []
  for (const c of (data ?? []) as CustomerForSend[]) {
    if (!isEmailable(c)) continue
    const key = c.email!.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }
  return deduped
}

export async function countEmailableAudience(
  supabase: SupabaseAdmin
): Promise<number> {
  return (await getEmailableAudience(supabase)).length
}

// ---------------------------------------------------------------------------
// Low-level single send
// ---------------------------------------------------------------------------

export interface SendOneInput {
  to: string
  /** Already merge-substituted. */
  subject: string
  /** Already merge-substituted inner body HTML. */
  innerHtml: string
  /** Already merge-substituted preheader. */
  preheader?: string | null
  /** This recipient's unsubscribe token (drives the per-user opt-out link). */
  unsubscribeToken: string
}

export interface SendOneResult {
  ok: boolean
  messageId?: string
  error?: string
}

// Build the full multipart message + deliverability headers and hand it to
// Resend. Never throws — returns a result the caller records.
export async function sendOne(input: SendOneInput): Promise<SendOneResult> {
  const resend = getResend()
  if (!resend) {
    return { ok: false, error: 'Resend not configured (RESEND_API_KEY missing)' }
  }

  const unsubUrl = unsubscribeUrlFor(input.unsubscribeToken)
  const unsubPostUrl = unsubscribePostUrlFor(input.unsubscribeToken)

  const html = renderMarketingHtml({
    innerHtml: input.innerHtml,
    preheader: input.preheader,
    unsubscribeUrl: unsubUrl,
  })
  const text = renderMarketingText(htmlToPlainText(input.innerHtml), unsubUrl)

  try {
    const result = await resend.emails.send({
      from: getMarketingFrom(),
      to: input.to,
      replyTo: getReplyTo(),
      subject: input.subject,
      html,
      text,
      headers: {
        // RFC 8058 one-click unsubscribe — the big inbox-placement lever.
        'List-Unsubscribe': `<${unsubPostUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })

    if (result.error) {
      return { ok: false, error: `${result.error.name}: ${result.error.message}` }
    }
    return { ok: true, messageId: result.data?.id ?? undefined }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Individual personalized send (from a customer's page)
// ---------------------------------------------------------------------------

export interface IndividualSendResult {
  ok: boolean
  error?: string
  skippedReason?: string
}

export async function sendIndividual(params: {
  customerId: string
  subject: string
  /** Raw composer text OR pre-rendered inner HTML. */
  innerHtml: string
  preheader?: string | null
}): Promise<IndividualSendResult> {
  const supabase = createAdminClient()

  const { data: customer, error } = await supabase
    .from('customers')
    .select(EMAILABLE_COLUMNS)
    .eq('id', params.customerId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!customer) return { ok: false, error: 'Customer not found' }

  const c = customer as CustomerForSend
  if (!c.email) return { ok: false, skippedReason: 'No email on file' }
  if (!isEmailable(c)) {
    return { ok: false, skippedReason: 'Customer is unsubscribed or suppressed' }
  }

  const vars = mergeVarsFor(c)
  const subject = applyMergeFieldsText(params.subject, vars)
  const innerHtml = applyMergeFields(params.innerHtml, vars)
  const preheader = params.preheader
    ? applyMergeFieldsText(params.preheader, vars)
    : null

  const sendRow = await supabase
    .from('marketing_sends')
    .insert({
      campaign_id: null,
      customer_id: c.id,
      to_email: c.email,
      status: 'queued',
      is_individual: true,
    })
    .select('id')
    .single()

  const result = await sendOne({
    to: c.email,
    subject,
    innerHtml,
    preheader,
    unsubscribeToken: c.unsubscribe_token,
  })

  if (sendRow.data) {
    await supabase
      .from('marketing_sends')
      .update({
        status: result.ok ? 'sent' : 'failed',
        resend_message_id: result.messageId ?? null,
        error: result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq('id', sendRow.data.id)
  }

  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

// ---------------------------------------------------------------------------
// Campaign blast
// ---------------------------------------------------------------------------

type CampaignRow = Database['public']['Tables']['marketing_campaigns']['Row']

export interface CampaignSendResult {
  attempted: number
  sent: number
  failed: number
  skipped: number
}

// Send a draft campaign to the whole emailable audience.
//
// Idempotent & resumable: a customer who already has a non-failed send row for
// this campaign is skipped, so re-running after a partial failure only fills the
// gaps. The (campaign_id, customer_id) unique index is the hard backstop.
export async function sendCampaign(
  campaignId: string
): Promise<CampaignSendResult> {
  const supabase = createAdminClient()

  const { data: campaign, error: campErr } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (campErr) throw new Error(campErr.message)
  if (!campaign) throw new Error('Campaign not found')
  const camp = campaign as CampaignRow

  if (camp.status === 'sent') {
    return { attempted: 0, sent: 0, failed: 0, skipped: 0 }
  }

  // Mark sending so the UI reflects in-flight state.
  await supabase
    .from('marketing_campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId)

  const audience = await getEmailableAudience(supabase)

  // Which customers already have a send row for this campaign?
  const { data: existingSends } = await supabase
    .from('marketing_sends')
    .select('id, customer_id, status')
    .eq('campaign_id', campaignId)

  const existingByCustomer = new Map<
    string,
    { id: string; status: string }
  >()
  for (const s of existingSends ?? []) {
    if (s.customer_id) {
      existingByCustomer.set(s.customer_id, { id: s.id, status: s.status })
    }
  }

  const result: CampaignSendResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  for (const c of audience) {
    const existing = existingByCustomer.get(c.id)
    // Already delivered/sent/opened? Don't re-send.
    if (existing && existing.status !== 'failed' && existing.status !== 'queued') {
      result.skipped++
      continue
    }

    result.attempted++

    const vars = mergeVarsFor(c)
    const subject = applyMergeFieldsText(camp.subject, vars)
    const innerHtml = applyMergeFields(camp.body_html, vars)
    const preheader = camp.preheader
      ? applyMergeFieldsText(camp.preheader, vars)
      : null

    // Ensure a send row exists (insert new, or reuse a failed one).
    let sendRowId = existing?.id ?? null
    if (!sendRowId) {
      const inserted = await supabase
        .from('marketing_sends')
        .insert({
          campaign_id: campaignId,
          customer_id: c.id,
          to_email: c.email!,
          status: 'queued',
          is_individual: false,
        })
        .select('id')
        .single()
      sendRowId = inserted.data?.id ?? null
    }

    const sendResult = await sendOne({
      to: c.email!,
      subject,
      innerHtml,
      preheader,
      unsubscribeToken: c.unsubscribe_token,
    })

    if (sendResult.ok) result.sent++
    else result.failed++

    if (sendRowId) {
      await supabase
        .from('marketing_sends')
        .update({
          status: sendResult.ok ? 'sent' : 'failed',
          resend_message_id: sendResult.messageId ?? null,
          error: sendResult.error ?? null,
          sent_at: sendResult.ok ? new Date().toISOString() : null,
        })
        .eq('id', sendRowId)
    }

    if (SEND_DELAY_MS > 0) await sleep(SEND_DELAY_MS)
  }

  // Finalize campaign counters + status.
  const totalSent = (camp.sent_count ?? 0) + result.sent
  const finalStatus: Database['public']['Enums']['campaign_status'] =
    result.sent > 0 || totalSent > 0 ? 'sent' : 'failed'

  await supabase
    .from('marketing_campaigns')
    .update({
      status: finalStatus,
      recipient_count: audience.length,
      sent_count: totalSent,
      sent_at: camp.sent_at ?? new Date().toISOString(),
    })
    .eq('id', campaignId)

  return result
}
