// Admin auth helpers. Use in admin server components and API routes to
// ensure the caller is a logged-in admin with appropriate role.
//
// Pattern:
//   const admin = await requireAdmin()                       // any active admin
//   const admin = await requireAdmin(['owner'])              // owner only
//   const admin = await requireAdmin(['owner', 'staff'])     // owner or staff
//
// Throws AdminAuthError if not authorized. In Server Components, catch and
// redirect to /admin/login. In API routes, catch and return the error response.

import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import type { Database } from './supabase/types'

type AdminRole = Database['public']['Enums']['admin_role']
type AdminUserRow = Database['public']['Tables']['admin_users']['Row']

export class AdminAuthError extends Error {
  constructor(
    public readonly code: 'unauthenticated' | 'not_authorized' | 'inactive',
    message: string
  ) {
    super(message)
    this.name = 'AdminAuthError'
  }
}

export interface AdminContext {
  authUserId: string
  admin: AdminUserRow
}

/**
 * Verify the caller is a logged-in active admin_user with one of the allowed
 * roles (default: any active admin). Returns the admin's auth user ID and
 * admin_users row, throws AdminAuthError otherwise.
 *
 * Use the server-cookies Supabase client to read the session, then the
 * service-role admin client to bypass RLS for the admin_users lookup
 * (we don't want every admin to be able to read every other admin's row).
 */
export async function requireAdmin(
  allowedRoles?: AdminRole[]
): Promise<AdminContext> {
  // 1. Validate the session token actually
  const supa = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supa.auth.getUser()

  if (userError || !user) {
    throw new AdminAuthError('unauthenticated', 'Not signed in')
  }

  // 2. Look up the admin_users row via service-role (bypasses RLS)
  const admin = createAdminClient()
  const { data: adminRow, error: adminError } = await admin
    .from('admin_users')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (adminError) {
    throw new AdminAuthError(
      'not_authorized',
      `Admin lookup failed: ${adminError.message}`
    )
  }

  if (!adminRow) {
    throw new AdminAuthError(
      'not_authorized',
      'This account has no admin access'
    )
  }

  if (!adminRow.active) {
    throw new AdminAuthError('inactive', 'Your admin access has been revoked')
  }

  if (allowedRoles && !allowedRoles.includes(adminRow.role)) {
    throw new AdminAuthError(
      'not_authorized',
      `This action requires one of: ${allowedRoles.join(', ')}`
    )
  }

  return { authUserId: user.id, admin: adminRow }
}
