// /admin/customers — searchable list of all customers in the system.
// Server component; the search box is a client component that updates a URL
// search param, which the server re-runs the query against.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import CustomerSearchInput from './CustomerSearchInput'

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface PageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  try {
    await requireAdmin()
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const { q } = await searchParams
  const query = q?.trim() ?? ''
  const supabase = createAdminClient()

  let queryBuilder = supabase
    .from('customers')
    .select(
      'id, first_name, last_name, email, phone, how_heard, marketing_opt_in, total_bookings, total_spent_cents, last_visit_at, created_at, stripe_customer_id'
    )
    .order('last_visit_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (query) {
    // Search across name and email
    const pattern = `%${query}%`
    queryBuilder = queryBuilder.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`
    )
  }

  const { data: customers, error } = await queryBuilder

  if (error) {
    return (
      <div className="bg-apex-red/10 border border-apex-red/30 p-4">
        <p className="telemetry-text text-apex-red">
          Failed to load customers: {error.message}
        </p>
      </div>
    )
  }

  const rows = customers ?? []

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="racing-headline text-3xl text-grid-white">Customers</h1>
        <p className="telemetry-text text-sm text-pit-gray mt-1">
          {rows.length} customer{rows.length === 1 ? '' : 's'}
          {query && ` matching "${query}"`}
        </p>
      </div>

      <CustomerSearchInput initialValue={query} />

      {rows.length === 0 ? (
        <div className="bg-asphalt-dark border border-white/5 p-8 text-center">
          <p className="telemetry-text text-pit-gray">
            {query ? 'No customers match your search.' : 'No customers yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-asphalt-dark border border-white/5">
          <table className="w-full">
            <thead className="border-b border-white/10">
              <tr className="text-left">
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Name
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Contact
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  How They Heard
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                  Bookings
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider text-right">
                  Spent
                </th>
                <th className="p-4 telemetry-text text-xs text-pit-gray uppercase tracking-wider">
                  Last Visit
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                  <td className="p-4">
                    <Link
                      href={`/admin/customers/${c.id}`}
                      className="telemetry-text text-grid-white hover:text-apex-red"
                    >
                      {c.first_name} {c.last_name}
                    </Link>
                    <div className="flex gap-1 mt-1">
                      {c.marketing_opt_in && (
                        <span className="telemetry-text text-xs px-1.5 py-0.5 bg-telemetry-cyan/10 text-telemetry-cyan border border-telemetry-cyan/20 uppercase">
                          Marketing
                        </span>
                      )}
                      {c.stripe_customer_id && (
                        <span className="telemetry-text text-xs px-1.5 py-0.5 bg-white/5 text-pit-gray border border-white/10 uppercase">
                          Card on file
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <p className="telemetry-text text-sm text-grid-white">{c.email}</p>
                    {c.phone && (
                      <p className="telemetry-text text-xs text-pit-gray">{c.phone}</p>
                    )}
                  </td>
                  <td className="p-4">
                    {c.how_heard ? (
                      <span className="telemetry-text text-xs px-2 py-1 bg-white/5 text-grid-white border border-white/10">
                        {c.how_heard}
                      </span>
                    ) : (
                      <span className="telemetry-text text-sm text-pit-gray">—</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <p className="telemetry-text text-grid-white">{c.total_bookings}</p>
                  </td>
                  <td className="p-4 text-right">
                    <p className="telemetry-text text-grid-white">
                      {formatDollars(c.total_spent_cents)}
                    </p>
                  </td>
                  <td className="p-4">
                    <p className="telemetry-text text-sm text-pit-gray">
                      {formatDate(c.last_visit_at)}
                    </p>
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
