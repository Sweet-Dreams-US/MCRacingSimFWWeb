// PATCH /api/admin/contact/[id]
// Toggle a contact inquiry between 'new' and 'handled' from the admin inbox.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let adminCtx
  try {
    adminCtx = await requireAdmin(['owner', 'staff'])
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

  let body: { status?: string }
  try {
    body = (await request.json()) as { status?: string }
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.status !== 'new' && body.status !== 'handled') {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contact_inquiries')
    .update({
      status: body.status,
      handled_at: body.status === 'handled' ? new Date().toISOString() : null,
      handled_by_user_id: body.status === 'handled' ? adminCtx.admin.id : null,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
