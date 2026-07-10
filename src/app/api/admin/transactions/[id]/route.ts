// PATCH /api/admin/transactions/[id]
// Connect, change, or detach the customer on a transaction. The transaction
// detail page uses this so a POS/cash sale recorded without a customer can be
// linked after the fact (which then enables resending a receipt / thank-you).
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
  let customerId: string | null = null
  try {
    const body = (await request.json()) as { customerId?: string | null }
    // Explicit null (or empty) detaches; a string connects.
    customerId = body.customerId ? String(body.customerId).trim() : null
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Validate the target transaction exists (and isn't soft-deleted).
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, soft_deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!txn || txn.soft_deleted_at) {
    return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 })
  }

  // If connecting, verify the customer exists so we never point at a ghost id.
  if (customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .maybeSingle()
    if (!cust) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 })
    }
  }

  const { error } = await supabase
    .from('transactions')
    .update({ customer_id: customerId, updated_by_user_id: adminCtx.admin.id })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, customerId })
}
