// Dashboard root. Skeleton only — real metric queries land in Phase 4 once
// bookings/transactions live in Supabase instead of the Google Sheet.
//
// We re-fetch the admin_users row here rather than threading it through layout
// props. Both queries are sub-millisecond against a tiny table, and keeping
// the layout prop-less means we don't have to invent a context provider for
// what is essentially "the current admin's display name."
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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
      <p className={`racing-headline text-5xl ${accentClass}`}>{value}</p>
      {helper && (
        <p className="telemetry-text text-xs text-pit-gray uppercase tracking-wider mt-3">
          {helper}
        </p>
      )}
    </div>
  )
}

// Use only the first name in the greeting — "Welcome back, Mark" reads better
// than "Welcome back, Mark Curtis." Fall back to the full name if the row
// somehow only has one word.
function firstName(fullName: string): string {
  const trimmed = fullName.trim()
  const space = trimmed.indexOf(' ')
  return space === -1 ? trimmed : trimmed.slice(0, space)
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Layout already enforces this, but TypeScript doesn't know — and a defensive
  // redirect here is cheap insurance if someone reuses this component elsewhere.
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

      {/* Metric cards — placeholders until Phase 4 wires real queries */}
      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12"
      >
        <MetricCard
          label="Today's Bookings"
          value="0"
          accentClass="text-apex-red"
          helper="Sessions on the schedule"
        />
        <MetricCard
          label="This Week's Revenue"
          value="$0"
          accentClass="text-telemetry-cyan"
          helper="Mon — Sun, all sources"
        />
        <MetricCard
          label="Pending No-Show Charges"
          value="0"
          accentClass="text-apex-red"
          helper="Awaiting capture"
        />
        <MetricCard
          label="Open Reports"
          value="—"
          accentClass="text-telemetry-cyan"
          helper="Issues needing review"
        />
      </section>

      <div className="section-divider mb-12" aria-hidden="true" />

      {/* Coming-soon roadmap so Mark can see what's still queued up */}
      <section aria-label="Coming soon">
        <h2 className="racing-headline text-2xl text-grid-white mb-2">
          <span className="text-telemetry-cyan">Coming </span>Soon
        </h2>
        <p className="telemetry-text text-sm text-pit-gray mb-6">
          What we&apos;re wiring up next. Each section is a placeholder today —
          live data flips on as the corresponding phase lands.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoadmapCard
            href="/admin/bookings"
            title="Bookings"
            description="See today's schedule, mark no-shows, manage walk-ins, capture cards at the counter."
            phase="Phase 4"
          />
          <RoadmapCard
            href="/admin/transactions"
            title="Transactions"
            description="Full ledger of every cent in and out, with Stripe + cash drawer reconciliation."
            phase="Phase 4"
          />
          <RoadmapCard
            href="/admin/customers"
            title="Customers"
            description="Lifetime value, booking history, saved cards, and notes per racer."
            phase="Phase 5"
          />
          <RoadmapCard
            href="/admin/expenses"
            title="Expenses"
            description="Tag expenses to IRS Schedule C lines so tax season is a non-event."
            phase="Phase 5"
          />
          <RoadmapCard
            href="/admin/payouts"
            title="Payouts"
            description="Owner draws, employee wages, and Sweet Dreams revenue share."
            phase="Phase 6"
          />
          <RoadmapCard
            href="/admin/reports"
            title="Reports"
            description="P&L, sales tax exports, chargeback evidence packets, and audit trails."
            phase="Phase 6"
          />
        </div>
      </section>
    </div>
  )
}

interface RoadmapCardProps {
  href: string
  title: string
  description: string
  phase: string
}

function RoadmapCard({ href, title, description, phase }: RoadmapCardProps) {
  return (
    <Link
      href={href}
      className="card-dark p-6 block group"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="racing-headline text-xl text-grid-white group-hover:text-apex-red transition-colors">
          {title}
        </h3>
        <span className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider border border-telemetry-cyan/30 px-2 py-0.5">
          {phase}
        </span>
      </div>
      <p className="telemetry-text text-sm text-pit-gray leading-relaxed">
        {description}
      </p>
    </Link>
  )
}
