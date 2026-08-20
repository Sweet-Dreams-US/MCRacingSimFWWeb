// /admin/ads — Meta (Facebook) ad performance.
//
// Server component. Pulls live insights from the Meta Ads API via
// src/lib/meta/insights.ts (needs META_ADS_TOKEN + META_AD_ACCOUNT_ID). The
// booking (Schedule) + Lead + Purchase conversions shown here are the same
// events our Pixel + Conversions API report, so cost-per-booking is real.
import Link from 'next/link'
import { getAdInsights, campaignKeyword, DATE_PRESETS, type DatePreset } from '@/lib/meta/insights'
import { formatDollars } from '@/lib/accounting'
import { getScheduleReconciliation } from '@/lib/meta/reconciliation'
import { getCampaignAttribution } from '@/lib/meta/campaign-attribution'

export const dynamic = 'force-dynamic' // always fetch fresh insights

interface PageProps {
  searchParams: Promise<{ range?: string }>
}

function isPreset(v: string | undefined): v is DatePreset {
  return DATE_PRESETS.some((p) => p.value === v)
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US')
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card-dark p-6">
      <p className="racing-headline text-sm text-pit-gray mb-3">{label}</p>
      <p className="racing-headline text-3xl lg:text-4xl text-grid-white">{value}</p>
      {helper && (
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          {helper}
        </p>
      )}
    </div>
  )
}

export default async function AdsPage({ searchParams }: PageProps) {
  const { range } = await searchParams
  const preset: DatePreset = isPreset(range) ? range : 'last_30d'
  // Independent of the date-range switcher: reconciliation is always the last
  // 6 weeks, because it answers a health question about the pipeline rather
  // than a performance question about a campaign.
  const [result, recon, attribution] = await Promise.all([
    getAdInsights(preset),
    getScheduleReconciliation(6),
    // Follows the range switcher, unlike reconciliation: this is a performance
    // question about creative, so the period has to match the spend above it.
    getCampaignAttribution(preset),
  ])

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">Meta Ads</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Facebook &amp; Instagram ad performance — bookings tracked via the Pixel + Conversions API.
          </p>
          <p className="telemetry-text text-xs text-pit-gray/70 uppercase tracking-wider mt-2">
            Showing only campaigns named with &ldquo;{campaignKeyword}&rdquo; (shared ad account)
          </p>
        </div>
        {/* Date-range switcher — plain links so it works without client JS. */}
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <Link
              key={p.value}
              href={`/admin/ads?range=${p.value}`}
              className={`telemetry-text text-xs uppercase tracking-wider px-3 py-2 border ${
                p.value === preset
                  ? 'border-telemetry-cyan text-telemetry-cyan bg-telemetry-cyan/10'
                  : 'border-white/15 text-pit-gray hover:border-white/40'
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {result.status === 'not_configured' && (
        <div className="card-dark p-8 border border-yellow-500/30">
          <h2 className="racing-headline text-xl text-yellow-400 mb-3">Almost there — one token needed</h2>
          <p className="telemetry-text text-sm text-pit-gray mb-4">
            Ad reporting is wired up but needs a Meta token with <code className="text-grid-white">ads_read</code>{' '}
            access to read this ad account. Missing environment variable
            {result.missing.length > 1 ? 's' : ''}:{' '}
            <span className="text-grid-white">{result.missing.join(', ')}</span>.
          </p>
          <ol className="telemetry-text text-sm text-pit-gray list-decimal list-inside space-y-1">
            <li>Meta Business Settings → Users → System Users → (create or pick one)</li>
            <li>Generate New Token → your app → permission <code className="text-grid-white">ads_read</code></li>
            <li>Assign the <span className="text-grid-white">Sweet Dreams Music</span> ad account to that system user</li>
            <li>Send the token to your developer to set as <code className="text-grid-white">META_ADS_TOKEN</code></li>
          </ol>
        </div>
      )}

      {result.status === 'error' && (
        <div className="card-dark p-8 border border-red-500/30">
          <h2 className="racing-headline text-xl text-red-400 mb-3">Couldn&apos;t load ad data</h2>
          <p className="telemetry-text text-sm text-pit-gray break-words">{result.message}</p>
          <p className="telemetry-text text-xs text-pit-gray mt-3">
            Usually this means the token expired or lost access to the ad account. Re-generate it and update{' '}
            <code className="text-grid-white">META_ADS_TOKEN</code>.
          </p>
        </div>
      )}

      {result.status === 'ok' && (
        <>
          {result.summary.spend === 0 && result.summary.impressions === 0 ? (
            <div className="card-dark p-8 mb-8">
              <p className="telemetry-text text-sm text-pit-gray">
                No MC Racing ad activity in this period. Only campaigns with{' '}
                <span className="text-grid-white">&ldquo;{campaignKeyword}&rdquo;</span> in their name are
                counted here (the ad account is shared with other brands) — make sure MC Racing campaigns
                follow that naming.
              </p>
            </div>
          ) : (
            <>
              {/* Headline spend/traffic metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard label="Spend" value={formatDollars(Math.round(result.summary.spend * 100))} />
                <StatCard label="Impressions" value={fmtInt(result.summary.impressions)} />
                <StatCard label="Reach" value={fmtInt(result.summary.reach)} />
                <StatCard
                  label="Clicks"
                  value={fmtInt(result.summary.clicks)}
                  helper={`${result.summary.ctr.toFixed(2)}% CTR · ${formatDollars(Math.round(result.summary.cpc * 100))} CPC`}
                />
              </div>

              {/* Conversions — the events our Pixel + CAPI report */}
              <h2 className="racing-headline text-lg text-grid-white mb-3">Conversions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {result.summary.conversions.map((c) => (
                  <StatCard
                    key={c.key}
                    label={c.label}
                    value={fmtInt(c.count)}
                    helper={c.costPer !== null ? `${formatDollars(Math.round(c.costPer * 100))} each` : 'no cost yet'}
                  />
                ))}
              </div>

              {/* Per-campaign table */}
              {result.campaigns.length > 0 && (
                <>
                  <h2 className="racing-headline text-lg text-grid-white mb-3">Campaigns</h2>
                  <div className="card-dark overflow-x-auto">
                    <table className="w-full telemetry-text text-sm">
                      <thead>
                        <tr className="text-left text-pit-gray border-b border-white/10">
                          <th className="p-4 font-normal uppercase tracking-wider text-xs">Campaign</th>
                          <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Spend</th>
                          <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Clicks</th>
                          <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">CTR</th>
                          <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Bookings</th>
                          <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Cost / booking</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.campaigns.map((c, i) => (
                          <tr key={i} className="border-b border-white/5 last:border-0">
                            <td className="p-4 text-grid-white">{c.name}</td>
                            <td className="p-4 text-right text-grid-white">
                              {formatDollars(Math.round(c.spend * 100))}
                            </td>
                            <td className="p-4 text-right text-pit-gray">{fmtInt(c.clicks)}</td>
                            <td className="p-4 text-right text-pit-gray">{c.ctr.toFixed(2)}%</td>
                            <td className="p-4 text-right text-telemetry-cyan">{fmtInt(c.bookings)}</td>
                            <td className="p-4 text-right text-grid-white">
                              {c.costPerBooking !== null
                                ? formatDollars(Math.round(c.costPerBooking * 100))
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------
          First-party attribution. Meta's Conversions panel above is what
          META believes; this is what our own booking rows say, read from
          the utm_* params captured at landing. utm_content is the ad name,
          so this is the table that names a winning creative even when Meta
          under-reports.
         --------------------------------------------------------------- */}
      <h2 className="racing-headline text-lg text-grid-white mt-10 mb-3">Bookings by ad (our data)</h2>
      <p className="telemetry-text text-sm text-pit-gray mb-4 max-w-3xl">
        Counted from the <span className="text-grid-white">utm_content</span> tag on each booking, not from
        Meta. Ad names in Ads Manager must match the{' '}
        <span className="text-grid-white">utm_content</span> value in that ad&apos;s destination URL exactly,
        or one creative shows up as two rows.
      </p>

      {attribution.status === 'unavailable' && (
        <div className="card-dark p-6 border border-yellow-500/30">
          <p className="telemetry-text text-sm text-pit-gray break-words">{attribution.message}</p>
        </div>
      )}

      {attribution.status === 'ok' && attribution.rows.length === 0 && (
        <div className="card-dark p-6">
          <p className="telemetry-text text-sm text-pit-gray">
            No bookings from a tagged link in this period.
            {attribution.organicBookings > 0 && (
              <>
                {' '}
                <span className="text-grid-white">{fmtInt(attribution.organicBookings)}</span> booking
                {attribution.organicBookings === 1 ? '' : 's'} arrived without campaign tags (direct, organic,
                or an untagged link).
              </>
            )}
          </p>
        </div>
      )}

      {attribution.status === 'ok' && attribution.rows.length > 0 && (
        <div className="card-dark overflow-x-auto">
          <table className="w-full telemetry-text text-sm">
            <thead>
              <tr className="text-left text-pit-gray border-b border-white/10">
                <th className="p-4 font-normal uppercase tracking-wider text-xs">Ad (utm_content)</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs">Campaign</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Bookings</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Revenue</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">With click ID</th>
              </tr>
            </thead>
            <tbody>
              {attribution.rows.map((r) => (
                <tr key={JSON.stringify([r.campaign, r.content])} className="border-b border-white/5 last:border-0">
                  <td className="p-4 text-telemetry-cyan">{r.content}</td>
                  <td className="p-4 text-pit-gray">{r.campaign}</td>
                  <td className="p-4 text-right text-grid-white">{fmtInt(r.bookings)}</td>
                  <td className="p-4 text-right text-grid-white">{formatDollars(r.revenueCents)}</td>
                  <td className="p-4 text-right text-pit-gray">{fmtInt(r.withClickId)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/10 text-pit-gray">
                <td className="p-4" colSpan={2}>
                  Untagged (direct, organic, or an untagged link)
                </td>
                <td className="p-4 text-right">{fmtInt(attribution.organicBookings)}</td>
                <td className="p-4 text-right">{formatDollars(attribution.organicRevenueCents)}</td>
                <td className="p-4 text-right">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------------------------------------------------------
          Tracking health. Meta's numbers above are Meta's; these are OURS.
          In July the two disagreed (8 reported vs 13 real) and nothing
          surfaced it. Any non-zero "Missing" means bookings happened that
          Meta was never told about — check the Vercel logs for
          "[meta] CAPI Schedule failed".
         --------------------------------------------------------------- */}
      <h2 className="racing-headline text-lg text-grid-white mt-10 mb-3">Tracking health</h2>
      <p className="telemetry-text text-sm text-pit-gray mb-4 max-w-3xl">
        Every confirmed online booking should send exactly one{' '}
        <span className="text-grid-white">Schedule</span> conversion to Meta. This compares our own
        booking records against what we actually managed to send — so a tracking outage shows up here
        the same week, not a month later in Ads Manager.
      </p>

      {recon.status === 'unavailable' && (
        <div className="card-dark p-6 border border-yellow-500/30">
          <p className="telemetry-text text-sm text-pit-gray break-words">{recon.message}</p>
        </div>
      )}

      {recon.status === 'ok' && recon.weeks.length === 0 && (
        <div className="card-dark p-6">
          <p className="telemetry-text text-sm text-pit-gray">
            No online bookings in the last 6 weeks to reconcile.
          </p>
        </div>
      )}

      {recon.status === 'ok' && recon.weeks.length > 0 && (
        <div className="card-dark overflow-x-auto">
          <table className="w-full telemetry-text text-sm">
            <thead>
              <tr className="text-left text-pit-gray border-b border-white/10">
                <th className="p-4 font-normal uppercase tracking-wider text-xs">Week of</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Bookings</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Sent to Meta</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">Missing</th>
                <th className="p-4 font-normal uppercase tracking-wider text-xs text-right">With ad click ID</th>
              </tr>
            </thead>
            <tbody>
              {recon.weeks.map((w) => (
                <tr key={w.weekStart} className="border-b border-white/5 last:border-0">
                  <td className="p-4 text-grid-white">{w.weekStart}</td>
                  <td className="p-4 text-right text-grid-white">{fmtInt(w.bookings)}</td>
                  <td className="p-4 text-right text-telemetry-cyan">{fmtInt(w.scheduleSent)}</td>
                  <td
                    className={`p-4 text-right ${
                      w.missing > 0 ? 'text-red-400 font-bold' : 'text-pit-gray'
                    }`}
                  >
                    {fmtInt(w.missing)}
                  </td>
                  <td className="p-4 text-right text-pit-gray">
                    {fmtInt(w.withClickId)}
                    {w.bookings > 0 && (
                      <span className="text-pit-gray/60">
                        {' '}
                        ({Math.round((w.withClickId / w.bookings) * 100)}%)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
