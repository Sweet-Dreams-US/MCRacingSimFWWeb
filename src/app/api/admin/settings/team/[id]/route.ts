// PATCH /api/admin/settings/team/[id]
// Owner-only: change another admin's role or active status. Guards against
// self-lockout and against removing the last active owner.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const ROLES = ['owner', 'staff', 'sweet_dreams', 'readonly'] as const
type Role = (typeof ROLES)[number]

interface Body {
  role?: string
  active?: boolean
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message, code: err.code },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const { id } = await params

  // Never let an owner change their OWN role/status here — the only way to lose
  // your own access should be a deliberate action by a different owner.
  if (id === adminCtx.admin.id) {
    return NextResponse.json(
      { success: false, error: 'You can’t change your own role or status.' },
      { status: 400 }
    )
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: { role?: Role; active?: boolean } = {}
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) {
      return NextResponse.json({ success: false, error: 'Invalid role' }, { status: 400 })
    }
    patch.role = body.role as Role
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Invalid active flag' }, { status: 400 })
    }
    patch.active = body.active
  }
  if (patch.role === undefined && patch.active === undefined) {
    return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: target, error: loadErr } = await supabase
    .from('admin_users')
    .select('id, role, active')
    .eq('id', id)
    .maybeSingle()
  if (loadErr || !target) {
    return NextResponse.json({ success: false, error: 'Admin not found' }, { status: 404 })
  }

  // Don't strand the console with zero active owners. If this change would drop
  // the target OUT of the active-owner set, make sure someone else remains.
  const wouldBeOwner = (patch.role ?? target.role) === 'owner'
  const wouldBeActive = patch.active ?? target.active
  const targetIsActiveOwnerNow = target.role === 'owner' && target.active
  const leavingActiveOwnerSet = targetIsActiveOwnerNow && !(wouldBeOwner && wouldBeActive)
  if (leavingActiveOwnerSet) {
    const { count } = await supabase
      .from('admin_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'owner')
      .eq('active', true)
      .neq('id', id)
    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { success: false, error: 'There must be at least one active owner.' },
        { status: 400 }
      )
    }
  }

  const { error } = await supabase.from('admin_users').update(patch).eq('id', id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
