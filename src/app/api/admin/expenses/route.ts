// POST /api/admin/expenses
//
// Insert an expense-type transaction. Like /api/admin/transactions the form
// sends a positive dollar amount and we negate it server-side, so the sum-as-
// P&L invariant holds.
//
// The receiptPath, if present, is a relative storage path inside the private
// `receipts` bucket. We store it as-is in receipt_url; callers that want to
// render it should generate a short-lived signed URL on demand.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  dollarsToCents,
  isValidPaymentMethod,
} from '@/lib/accounting'

export const runtime = 'nodejs'

interface CreateExpenseBody {
  categoryId?: string
  amount?: string
  occurredOn?: string
  description?: string
  vendor?: string | null
  paymentMethod?: string
  receiptPath?: string | null
}

export async function POST(request: NextRequest) {
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

  let body: CreateExpenseBody
  try {
    body = (await request.json()) as CreateExpenseBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  if (!body.categoryId) {
    return NextResponse.json(
      { success: false, error: 'Category is required' },
      { status: 400 }
    )
  }
  if (!body.paymentMethod || !isValidPaymentMethod(body.paymentMethod)) {
    return NextResponse.json(
      { success: false, error: 'Invalid payment method' },
      { status: 400 }
    )
  }
  const rawCents = dollarsToCents(body.amount ?? '')
  if (!Number.isFinite(rawCents) || rawCents === 0) {
    return NextResponse.json(
      { success: false, error: 'Amount must be a non-zero number' },
      { status: 400 }
    )
  }
  // Expenses are outflows; store as negative regardless of input sign.
  const amountCents = -Math.abs(Math.round(rawCents))

  const description = (body.description ?? '').trim()
  if (!description) {
    return NextResponse.json(
      { success: false, error: 'Description is required' },
      { status: 400 }
    )
  }

  const occurredOn = (body.occurredOn ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return NextResponse.json(
      { success: false, error: 'Date must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Verify the category exists + is active before we insert the FK.
  const { data: category, error: catError } = await supabase
    .from('expense_categories')
    .select('id, active')
    .eq('id', body.categoryId)
    .maybeSingle()
  if (catError || !category) {
    return NextResponse.json(
      { success: false, error: 'Category not found' },
      { status: 400 }
    )
  }
  if (!category.active) {
    return NextResponse.json(
      { success: false, error: 'Category is no longer active' },
      { status: 400 }
    )
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('transactions')
    .insert({
      type: 'expense',
      amount_cents: amountCents,
      occurred_on: occurredOn,
      description,
      payment_method: body.paymentMethod,
      expense_category_id: body.categoryId,
      vendor: body.vendor ?? null,
      receipt_url: body.receiptPath ?? null,
      created_by_user_id: adminCtx.admin.id,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      {
        success: false,
        error: `Insert failed: ${insertErr?.message ?? 'unknown'}`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, transactionId: inserted.id })
}
