// /admin/marketing/[id] — campaign detail.
//   draft    → edit composer + test/send/delete panel
//   sending  → live stats that auto-refresh until done
//   sent     → final stats + read-only preview
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { countEmailableAudience } from '@/lib/marketing/send'
import CampaignComposer from '../CampaignComposer'
import { CampaignStatusBadge } from '../CampaignStatusBadge'
import DraftSendPanel from './DraftSendPanel'
import SendingPoller from './SendingPoller'

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data: campaign } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) notFound()

  const isDraft = campaign.status === 'draft'
  const isSending = campaign.status === 'sending'

  // Only need the live audience count while still composing.
  const audienceCount = isDraft ? await countEmailableAudience(supabase) : 0

  const deliverRate =
    campaign.sent_count > 0
      ? Math.round((campaign.delivered_count / campaign.sent_count) * 100)
      : null
  const openRate =
    campaign.delivered_count > 0
      ? Math.round((campaign.opened_count / campaign.delivered_count) * 100)
      : null

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <Link
          href="/admin/marketing"
          className="telemetry-text text-xs text-pit-gray hover:text-grid-white"
        >
          ← Back to Email Marketing
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h1 className="racing-headline text-3xl text-grid-white">{campaign.name}</h1>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          {campaign.status === 'draft'
            ? 'Draft — not sent yet'
            : `Sent ${formatDateTime(campaign.sent_at)}`}
        </p>
      </div>

      {/* DRAFT: edit + send */}
      {isDraft && (
        <>
          <CampaignComposer
            mode="edit"
            campaignId={campaign.id}
            audienceCount={audienceCount}
            initial={{
              name: campaign.name,
              subject: campaign.subject,
              preheader: campaign.preheader ?? '',
              bodyText: campaign.body_text ?? '',
              ctaLabel: campaign.cta_label ?? '',
              ctaUrl: campaign.cta_url ?? '',
            }}
          />
          <div className="border-t border-white/10 pt-6">
            <DraftSendPanel campaignId={campaign.id} audienceCount={audienceCount} />
          </div>
        </>
      )}

      {/* SENDING / SENT: stats */}
      {!isDraft && (
        <>
          {isSending && <SendingPoller />}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Recipients" value={String(campaign.recipient_count)} accent="cyan" />
            <StatCard label="Sent" value={String(campaign.sent_count)} accent="white" />
            <StatCard
              label="Delivered"
              value={String(campaign.delivered_count)}
              sub={deliverRate === null ? undefined : `${deliverRate}%`}
              accent="green"
            />
            <StatCard
              label="Opened"
              value={String(campaign.opened_count)}
              sub={openRate === null ? undefined : `${openRate}%`}
              accent="green"
            />
            <StatCard label="Bounced" value={String(campaign.bounced_count)} accent="gray" />
            <StatCard label="Spam" value={String(campaign.complained_count)} accent="red" />
          </div>

          {isSending && (
            <p className="telemetry-text text-sm text-telemetry-cyan">
              Sending in progress… this page updates automatically. Delivery and
              open numbers keep climbing as inboxes report back over the next
              minutes to hours.
            </p>
          )}

          {/* Read-only content */}
          <div className="bg-asphalt-dark border border-white/5 p-6 space-y-3 max-w-2xl">
            <div>
              <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">Subject</p>
              <p className="telemetry-text text-grid-white">{campaign.subject}</p>
            </div>
            {campaign.preheader && (
              <div>
                <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Preview text
                </p>
                <p className="telemetry-text text-grid-white">{campaign.preheader}</p>
              </div>
            )}
            <div>
              <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">Message</p>
              <p className="telemetry-text text-grid-white whitespace-pre-line">
                {campaign.body_text}
              </p>
            </div>
            {campaign.cta_label && campaign.cta_url && (
              <div>
                <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">Button</p>
                <p className="telemetry-text text-grid-white">
                  {campaign.cta_label} → {campaign.cta_url}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: 'cyan' | 'white' | 'green' | 'gray' | 'red'
}) {
  const accentClass = {
    cyan: 'text-telemetry-cyan',
    white: 'text-grid-white',
    green: 'text-green-400',
    gray: 'text-pit-gray',
    red: 'text-apex-red',
  }[accent]
  return (
    <div className="bg-asphalt-dark border border-white/5 p-4">
      <p className="telemetry-text text-[10px] text-pit-gray uppercase tracking-wider">
        {label}
      </p>
      <p className={`racing-headline text-2xl ${accentClass} mt-1`}>{value}</p>
      {sub && <p className="telemetry-text text-xs text-pit-gray mt-0.5">{sub}</p>}
    </div>
  )
}
