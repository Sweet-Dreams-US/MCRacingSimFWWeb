// /admin/expenses/new — categorised expense entry with optional receipt photo
// upload. Server component fetches the category list so the form's dropdown
// is populated before the client JS hydrates.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import ExpenseForm from './ExpenseForm'

export default async function NewExpensePage() {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) redirect('/admin/login')
    throw err
  }

  const supabase = createAdminClient()
  const { data: rawCategories } = await supabase
    .from('expense_categories')
    .select('id, name, schedule_c_line')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const categories = (rawCategories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    scheduleCLine: c.schedule_c_line,
  }))

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/expenses"
          className="telemetry-text text-xs text-telemetry-cyan uppercase tracking-wider hover:text-telemetry-cyan-glow"
        >
          ← Back to expenses
        </Link>
        <h1 className="racing-headline text-3xl lg:text-4xl text-grid-white mt-2">
          New Expense
        </h1>
        <p className="telemetry-text text-sm text-pit-gray mt-2 max-w-xl">
          Log an expense for the books. Attach a photo of the receipt if you
          have one — it&apos;ll be stored privately and only admins can see it.
        </p>
      </div>

      <ExpenseForm categories={categories} />
    </div>
  )
}
