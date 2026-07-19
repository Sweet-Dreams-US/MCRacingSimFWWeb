// Authed admin layout — wraps every /admin/* page EXCEPT /admin/login.
//
// The route group "(authed)" is invisible in URLs (so /admin still serves the
// dashboard) but lets us scope this layout's auth gate to only the gated pages.
// /admin/login lives at src/app/admin/login/page.tsx, outside this group, so
// it skips the gate — otherwise unauthenticated users would loop forever
// trying to render the login page itself.
//
// This layout is a Server Component:
//   1. Confirms there's a logged-in Supabase user.
//   2. Looks up their admin_users row by auth_user_id.
//   3. If either check fails, kicks them to /admin/login.
//   4. Renders the AdminSidebar (client component) with the admin's name+role.
//
// Middleware already gates /admin/* for "must be logged in" — this layout is
// the second gate: "must have an active admin_users row". Auth-only is not
// enough to use the panel.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from '../AdminSidebar'

type AdminRole = 'owner' | 'staff' | 'sweet_dreams' | 'readonly'

interface AdminUserRow {
  id: string
  full_name: string
  role: AdminRole
  active: boolean
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  // Look up the admin profile. If they have an auth user but no admin_users
  // row (or their row is inactive), they don't get in — sign them out implicitly
  // by sending them to login. Mark seeds his own row manually after first login.
  const { data: adminUser, error } = await supabase
    .from('admin_users')
    .select('id, full_name, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle<AdminUserRow>()

  if (error || !adminUser || !adminUser.active) {
    redirect('/admin/login?error=not_authorized')
  }

  return (
    // overflow-x-clip is a safety net against any child that would push the page
    // wider than the phone screen. Unlike overflow-x-hidden it creates no scroll
    // container, so sticky headers/toolbars inside pages keep working. Per-page
    // wide content (tables, charts) still scrolls inside its own overflow-x-auto.
    <div className="min-h-screen bg-asphalt text-grid-white overflow-x-clip">
      <AdminSidebar fullName={adminUser.full_name} role={adminUser.role} />
      {/* Push content right of the 16rem sidebar on desktop; clear the 56px
          mobile top bar with pt-16 below lg. min-w-0 lets wide flex/grid
          children shrink instead of forcing the page wider. */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen min-w-0 overflow-x-clip">
        {children}
      </main>
    </div>
  )
}
