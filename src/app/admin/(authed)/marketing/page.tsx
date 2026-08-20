// /admin/marketing — email marketing home.
// Shows audience health (who we can email, who opted out) and the list of
// campaigns with their performance.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { countEmailableAudience } from '@/lib/marketing/send'
import {
  ASSUMED_MATCH_RATE,
  META_LOOKALIKE_MIN_MATCHES,
} from '@/lib/marketing/audience-export'
import { CampaignStatusBadge } from './CampaignStatusBadge'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function MarketingPage() {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()

  const [emailable, unsub, suppressed, campaignsRes] = await Promise.all([
    countEmailableAudience(supabase),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('unsubscribed_at', 'is', null),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .or('email_bounced_at.not.is.null,email_complained_at.not.is.null'),
    supabase
      .from('marketing_campaigns')
      .select(
        'id, name, subject, status, recipient_count, sent_count, delivered_count, opened_count, bounced_count, created_at, sent_at'
      )
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const campaigns = campaignsRes.data ?? []
  const unsubCount = unsub.count ?? 0
  const suppressedCount = suppressed.count ?? 0

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="racing-headline text-3xl text-grid-white">Email Marketing</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Promotions, deals, and re-engagement to past customers.
          </p>
        </div>
        <Link
          href="/admin/marketing/new"
          className="racing-headline text-sm uppercase tracking-wider bg-apex-red hover:bg-apex-red-dark text-grid-white px-5 py-3 transition-colors"
        >
          + New Campaign
        </Link>
      </div>

      {/* Audience health */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AudienceCard
          label="Can email"
          value={String(emailable)}
          accent="green"
          hint="Unique inboxes, opted out removed"
        />
        <AudienceCard
          label="Unsubscribed"
          value={String(unsubCount)}
          accent="gray"
          hint="Honored automatically"
        />
        <AudienceCard
          label="Bounced / spam"
          value={String(suppressedCount)}
          accent="red"
          hint="Suppressed to protect deliverability"
        />
      </div>

      {/* Meta ad audience export -------------------------------------------
          Seeds a Custom Audience (and the Lookalike built from it). Email
          only: a phone list uploaded for ad targeting is exactly what our
          10DLC disclosure promises we will not do. */}
      <div className="bg-asphalt-dark border border-white/5 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="max-w-2xl">
            <h2 className="racing-headline text-lg text-grid-white mb-2">Meta ad audience</h2>
            <p className="telemetry-text text-sm text-pit-gray">
              Downloads the same {emailable} marketable {emailable === 1 ? 'inbox' : 'inboxes'} as a CSV for
              Meta &rarr; Audiences &rarr; Customer List. One{' '}
              <code className="text-grid-white">email</code> column, lowercased, deduplicated, unsubscribes
              and bounces already removed. Meta hashes it on upload.
            </p>
            <p className="telemetry-text text-sm text-pit-gray mt-3">
              <span className="text-grid-white font-bold">Email only, on purpose.</span> Phone numbers are
              never included. Uploading a phone list for ad targeting is precisely the &ldquo;share mobile
              information for marketing&rdquo; our SMS policy disclaims, so the export has no phone column
              at all.
            </p>
            {(() => {
              const est = Math.round(emailable * ASSUMED_MATCH_RATE)
              const clears = est >= META_LOOKALIKE_MIN_MATCHES
              return (
                <p
                  className={`telemetry-text text-sm mt-3 ${clears ? 'text-pit-gray' : 'text-yellow-400'}`}
                >
                  At a typical ~{Math.round(ASSUMED_MATCH_RATE * 100)}% match rate that is roughly{' '}
                  <span className="text-grid-white font-bold">{est}</span> matched people.{' '}
                  {clears ? (
                    <>
                      Above Meta&apos;s {META_LOOKALIKE_MIN_MATCHES}-match floor for a Lookalike seed, though
                      not by much &mdash; if the Lookalike will not build, use a broad Advantage+ audience
                      instead.
                    </>
                  ) : (
                    <>
                      Below Meta&apos;s {META_LOOKALIKE_MIN_MATCHES}-match floor, so a Lookalike likely will
                      not build. Use a broad Advantage+ audience instead.
                    </>
                  )}
                </p>
              )
            })()}
          </div>
          <a
            href="/api/admin/customers/audience-export"
            className="racing-headline text-sm uppercase tracking-wider border border-telemetry-cyan text-telemetry-cyan hover:bg-telemetry-cyan/10 px-5 py-3 transition-colors whitespace-nowrap"
          >
            Download CSV
          </a>
        </div>
      </div>

      {/* Campaigns */}
      <div>
        <h2 className="racing-headline text-lg text-grid-white mb-3">Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
            <p className="telemetry-text text-pit-gray">
              No campaigns yet. Create your first one to reach past customers.
            </p>
          </div>
        ) : (
          <div className="bg-asphalt-dark border border-white/5 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-white/10">
                <tr className="text-left">
                  <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                    Status
                  </th>
                  <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                    Sent
                  </th>
                  <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                    Opened
                  </th>
                  <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const openRate =
                    c.delivered_count > 0
                      ? Math.round((c.opened_count / c.delivered_count) * 100)
                      : null
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                    >
                      <td className="p-4">
                        <Link
                          href={`/admin/marketing/${c.id}`}
                          className="telemetry-text text-grid-white hover:text-apex-red"
                        >
                          {c.name}
                        </Link>
                        <p className="telemetry-text text-xs text-pit-gray mt-0.5 truncate max-w-xs">
                          {c.subject}
                        </p>
                      </td>
                      <td className="p-4">
                        <CampaignStatusBadge status={c.status} />
                      </td>
                      <td className="p-4 text-right telemetry-text text-grid-white">
                        {c.sent_count}
                        {c.recipient_count > 0 && (
                          <span className="text-pit-gray"> / {c.recipient_count}</span>
                        )}
                      </td>
                      <td className="p-4 text-right telemetry-text text-grid-white">
                        {openRate === null ? '—' : `${openRate}%`}
                      </td>
                      <td className="p-4 telemetry-text text-sm text-pit-gray">
                        {formatDate(c.sent_at ?? c.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function AudienceCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: string
  accent: 'green' | 'gray' | 'red'
  hint: string
}) {
  const accentClass = {
    green: 'text-green-400',
    gray: 'text-pit-gray',
    red: 'text-apex-red',
  }[accent]
  return (
    <div className="bg-asphalt-dark border border-white/5 p-6">
      <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider">
        {label}
      </p>
      <p className={`racing-headline text-4xl ${accentClass} mt-2`}>{value}</p>
      <p className="telemetry-text text-xs text-pit-gray mt-2">{hint}</p>
    </div>
  )
}
