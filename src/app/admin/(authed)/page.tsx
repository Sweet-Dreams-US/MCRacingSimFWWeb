// Dashboard root — live money + operational metrics for MC Racing Sim.
//
// Server component. The greeting comes from the current admin_users row; the
// metrics come from src/lib/dashboard-metrics.ts (all money math + Eastern
// timezone handling lives there so it can be reviewed/tested in one place).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDashboardMetrics, type DailyPoint, type UpcomingBooking } from '@/lib/dashboard-metrics'
import { formatDollars, formatDate, formatTime } from '@/lib/accounting'

type AdminRole = 'owner' | 'staff' | 'sweet_dreams' | 'readonly'

interface AdminUserRow {
  full_name: string
  role: AdminRole
}

interface MetricCardProps {
  label: string
  value: string
  accentClass: string
  helper?: string
}

function MetricCard({ label, value, accentClass, helper }: MetricCardProps) {
  return (
    <div className="card-dark p-6">
      <p className="racing-headline text-sm text-pit-gray mb-3">{label}</p>
      <p className={`racing-headline text-4xl lg:text-5xl ${accentClass}`}>{value}</p>
      {helper && (
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          {helper}
        </p>
      )}
    </div>
  )
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim()
  const space = trimmed.indexOf(' ')
  return space === -1 ? trimmed : trimmed.slice(0, space)
}

// "Jul 4" short label for chart ticks.
function shortDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12))
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(dt)
}

// Hand-rolled 14-day revenue bar chart (no chart library). Pure render.
function RevenueChart({ daily }: { daily: DailyPoint[] }) {
  const max = Math.max(1, ...daily.map((d) => d.cents))
  const hasData = daily.some((d) => d.cents > 0)
  const total = daily.reduce((s, d) => s + d.cents, 0)

  return (
    <div className="card-dark p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <p className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-widest mb-1">
            // Revenue
          </p>
          <h2 className="racing-headline text-xl text-grid-white">Last 14 days</h2>
        </div>
        <p className="racing-headline text-2xl text-telemetry-cyan">{formatDollars(total)}</p>
      </div>

      {hasData ? (
        <div className="flex items-end gap-1.5 h-40" role="img" aria-label="Daily revenue for the last 14 days">
          {daily.map((d) => {
            const pct = Math.round((d.cents / max) * 100)
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full flex items-end h-full">
                  <div
                    className="w-full bg-telemetry-cyan/60 group-hover:bg-telemetry-cyan transition-colors relative"
                    style={{ height: `${Math.max(d.cents > 0 ? 4 : 0, pct)}%` }}
                    title={`${formatDate(d.date)}: ${formatDollars(d.cents)}`}
                  />
                </div>
                <span className="telemetry-text text-[9px] text-pit-gray whitespace-nowrap">
                  {shortDay(d.date).replace(/^\w+ /, '')}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="h-40 flex items-center justify-center border border-dashed border-white/10">
          <p className="telemetry-text text-sm text-pit-gray">No revenue recorded in the last 14 days yet.</p>
        </div>
      )}
    </div>
  )
}

function UpcomingList({ bookings }: { bookings: UpcomingBooking[] }) {
  return (
    <div className="card-dark p-6">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-1">
            // On the grid
          </p>
          <h2 className="racing-headline text-xl text-grid-white">Upcoming sessions</h2>
        </div>
        <Link
          href="/admin/bookings"
          className="telemetry-text text-xs text-pit-gray hover:text-telemetry-cyan uppercase tracking-wider"
        >
          View all →
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-white/10">
          <p className="telemetry-text text-sm text-pit-gray">No upcoming sessions booked.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/bookings/${b.id}`}
                className="flex items-center justify-between p-3 border border-white/5 hover:border-apex-red/40 transition-colors"
              >
                <div>
                  <p className="telemetry-text text-sm text-grid-white">
                    {b.customerName ?? '(no name)'}
                  </p>
                  <p className="telemetry-text text-xs text-pit-gray">
                    {formatDate(b.sessionDate)} • {formatTime(b.startTime)} •{' '}
                    {b.racerCount} racer{b.racerCount > 1 ? 's' : ''}
                  </p>
                </div>
                <span className="telemetry-text text-xs text-pit-gray">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('full_name, role')
    .eq('auth_user_id', user.id)
    .maybeSingle<AdminUserRow>()

  if (!adminUser) {
    redirect('/admin/login?error=not_authorized')
  }

  const greeting = firstName(adminUser.full_name)

  // Metrics use the service-role client (aggregate reads across bookings /
  // transactions / customers). The layout already gated an active admin.
  const metrics = await getDashboardMetrics(createAdminClient())
  const { revenue, ops, upcoming } = metrics

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-10">
        <p className="telemetry-text text-xs text-apex-red uppercase tracking-widest mb-2">
          // Pit Crew Console
        </p>
        <h1 className="racing-headline text-4xl lg:text-5xl text-grid-white">
          Welcome back, <span className="text-apex-red">{greeting}</span>
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-3">
          Live operational view of MC Racing Sim Fort Wayne.
        </p>
      </header>

      {/* Money in */}
      <section aria-label="Revenue" className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <MetricCard
          label="Money In — Today"
          value={formatDollars(revenue.todayCents)}
          accentClass="text-telemetry-cyan"
          helper="Gross sales, cash + card"
        />
        <MetricCard
          label="This Week"
          value={formatDollars(revenue.weekCents)}
          accentClass="text-telemetry-cyan"
          helper="Mon — today"
        />
        <MetricCard
          label="This Month"
          value={formatDollars(revenue.monthCents)}
          accentClass="text-telemetry-cyan"
          helper="Month to date"
        />
      </section>

      {/* Operational */}
      <section
        aria-label="Operations"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        <MetricCard
          label="Today's Bookings"
          value={String(ops.todaysBookings)}
          accentClass="text-apex-red"
          helper="Sessions on the schedule"
        />
        <MetricCard
          label="Upcoming"
          value={String(ops.upcomingSessions)}
          accentClass="text-grid-white"
          helper="Confirmed, after today"
        />
        <MetricCard
          label="New Customers"
          value={String(ops.newCustomers30d)}
          accentClass="text-grid-white"
          helper="Last 30 days"
        />
        <MetricCard
          label="No-Show Rate"
          value={ops.noShowRatePct === null ? '—' : `${ops.noShowRatePct}%`}
          accentClass={
            ops.noShowRatePct !== null && ops.noShowRatePct >= 20
              ? 'text-apex-red'
              : 'text-grid-white'
          }
          helper={
            ops.noShowRatePct === null
              ? 'No sessions closed out yet'
              : `${ops.completedSessions30d} sessions run (30d)`
          }
        />
      </section>

      {/* Charts + upcoming */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
        <RevenueChart daily={revenue.daily} />
        <UpcomingList bookings={upcoming} />
      </section>

      <div className="section-divider mb-10" aria-hidden="true" />

      {/* Quick links */}
      <section aria-label="Quick links">
        <h2 className="racing-headline text-2xl text-grid-white mb-6">
          <span className="text-telemetry-cyan">Jump </span>To
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickLink href="/admin/bookings" title="Bookings" description="Today's schedule, no-shows, walk-ins, edits." />
          <QuickLink href="/admin/transactions" title="Transactions" description="Every cent in and out, Stripe + cash." />
          <QuickLink href="/admin/customers" title="Customers" description="Lifetime value, history, how they heard." />
          <QuickLink href="/admin/discounts" title="Discount Codes" description="Generate + manage codes and referrals." />
          <QuickLink href="/admin/reports" title="Reports" description="P&L, sales-tax exports, payouts." />
          <QuickLink href="/admin/marketing" title="Marketing" description="Email campaigns and per-customer sends." />
        </div>
      </section>
    </div>
  )
}

interface QuickLinkProps {
  href: string
  title: string
  description: string
}

function QuickLink({ href, title, description }: QuickLinkProps) {
  return (
    <Link href={href} className="card-dark p-6 block group">
      <h3 className="racing-headline text-xl text-grid-white group-hover:text-apex-red transition-colors mb-2">
        {title}
      </h3>
      <p className="telemetry-text text-sm text-pit-gray leading-relaxed">{description}</p>
    </Link>
  )
}
