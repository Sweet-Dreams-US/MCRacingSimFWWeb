// POST /api/admin/transactions
//
// Records a manually-entered transaction. The form on /admin/transactions/new
// always sends a positive dollar amount; we flip the sign here based on the
// transaction type so SUM(amount_cents) on the ledger continues to equal
// net P&L.
//
// Auth: owner OR staff. Payouts use a separate, owner-only endpoint.
//
// Customer linking: if customerEmail is provided we find-or-create a minimal
// customer row (just email + a placeholder name from the local-part). This
// keeps walk-in cash sales linked to a customer for the long-term LTV report
// without forcing admins to type a full name every time.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  dollarsToCents,
  isOutflow,
  isValidPaymentMethod,
  isValidTransactionType,
} from '@/lib/accounting'

export const runtime = 'nodejs'

interface CreateTransactionBody {
  type?: string
  amount?: string
  occurredOn?: string
  description?: string
  paymentMethod?: string
  customerEmail?: string | null
  receiptUrl?: string | null
  vendor?: string | null
  bookingId?: string | null
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

  let body: CreateTransactionBody
  try {
    body = (await request.json()) as CreateTransactionBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  // ---- Validate enum fields ----------------------------------------------
  if (!body.type || !isValidTransactionType(body.type)) {
    return NextResponse.json(
      { success: false, error: 'Invalid transaction type' },
      { status: 400 }
    )
  }
  if (!body.paymentMethod || !isValidPaymentMethod(body.paymentMethod)) {
    return NextResponse.json(
      { success: false, error: 'Invalid payment method' },
      { status: 400 }
    )
  }

  // ---- Validate amount ----------------------------------------------------
  if (!body.amount || typeof body.amount !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Amount is required' },
      { status: 400 }
    )
  }
  const rawCents = dollarsToCents(body.amount)
  if (!Number.isFinite(rawCents) || rawCents === 0) {
    return NextResponse.json(
      { success: false, error: 'Amount must be a non-zero number' },
      { status: 400 }
    )
  }
  // Form always sends positive; flip sign based on type. If the caller is a
  // scripted client and sent a signed value, take the absolute value first
  // so we end up with the convention's sign either way.
  const positiveCents = Math.abs(Math.round(rawCents))
  const amountCents = isOutflow(body.type) ? -positiveCents : positiveCents

  // ---- Validate description ----------------------------------------------
  const description = (body.description ?? '').trim()
  if (!description) {
    return NextResponse.json(
      { success: false, error: 'Description is required' },
      { status: 400 }
    )
  }

  // ---- Validate occurredOn -----------------------------------------------
  const occurredOn = (body.occurredOn ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return NextResponse.json(
      { success: false, error: 'Date must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // ---- Find-or-create customer (optional) --------------------------------
  let customerId: string | null = null
  const emailRaw = (body.customerEmail ?? '').trim().toLowerCase()
  if (emailRaw) {
    if (!emailRaw.includes('@')) {
      return NextResponse.json(
        { success: false, error: 'Customer email looks invalid' },
        { status: 400 }
      )
    }
    const { data: existing, error: lookupErr } = await supabase
      .from('customers')
      .select('id')
      .ilike('email', emailRaw)
      .maybeSingle()
    if (lookupErr) {
      return NextResponse.json(
        { success: false, error: `Customer lookup failed: ${lookupErr.message}` },
        { status: 500 }
      )
    }
    if (existing) {
      customerId = existing.id
    } else {
      // Minimal placeholder so the FK is satisfied. Admin can edit the customer
      // record from /admin/customers/[id] later to fill in the real name.
      const localPart = emailRaw.split('@')[0] ?? 'walk-in'
      const { data: inserted, error: insertErr } = await supabase
        .from('customers')
        .insert({
          first_name: localPart,
          last_name: '(walk-in)',
          email: emailRaw,
          marketing_opt_in: false,
        })
        .select('id')
        .single()
      if (insertErr || !inserted) {
        return NextResponse.json(
          {
            success: false,
            error: `Customer create failed: ${insertErr?.message ?? 'unknown'}`,
          },
          { status: 500 }
        )
      }
      customerId = inserted.id
    }
  }

  // ---- Insert transaction -------------------------------------------------
  const { data: inserted, error: insertErr } = await supabase
    .from('transactions')
    .insert({
      type: body.type,
      amount_cents: amountCents,
      occurred_on: occurredOn,
      description,
      payment_method: body.paymentMethod,
      customer_id: customerId,
      booking_id: body.bookingId ?? null,
      receipt_url: body.receiptUrl ?? null,
      vendor: body.vendor ?? null,
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

  return NextResponse.json({
    success: true,
    transactionId: inserted.id,
    amountCents,
  })
}
