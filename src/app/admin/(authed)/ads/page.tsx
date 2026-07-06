// /admin/ads — Meta (Facebook) ad performance.
//
// Server component. Pulls live insights from the Meta Ads API via
// src/lib/meta/insights.ts (needs META_ADS_TOKEN + META_AD_ACCOUNT_ID). The
// booking (Schedule) + Lead + Purchase conversions shown here are the same
// events our Pixel + Conversions API report, so cost-per-booking is real.
import Link from 'next/link'
import { getAdInsights, DATE_PRESETS, type DatePreset } from '@/lib/meta/insights'
import { formatDollars } from '@/lib/accounting'

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
  const result = await getAdInsights(preset)

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white">Meta Ads</h1>
          <p className="telemetry-text text-sm text-pit-gray mt-1">
            Facebook &amp; Instagram ad performance — bookings tracked via the Pixel + Conversions API.
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
                No ad activity in this period yet. Once campaigns run in the{' '}
                <span className="text-grid-white">Sweet Dreams Music</span> ad account, spend, reach, and
                cost-per-booking will show here.
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
    </div>
  )
}
