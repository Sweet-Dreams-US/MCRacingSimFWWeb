// POST /api/admin/payouts
//
// Owner-only manual payout entry. Inserts a transaction row with negative
// amount, payout_recipient, and optional period dates. Marketing payouts have
// a separate flow (calculation + mark-paid) — this endpoint only accepts
// owner_payout and employee_payout.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  dollarsToCents,
  isValidPaymentMethod,
} from '@/lib/accounting'

export const runtime = 'nodejs'

interface CreatePayoutBody {
  type?: string
  recipient?: string
  amount?: string
  occurredOn?: string
  periodStart?: string | null
  periodEnd?: string | null
  paymentMethod?: string
  notes?: string | null
}

const ALLOWED_TYPES = new Set(['owner_payout', 'employee_payout'])

function isYMD(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(request: NextRequest) {
  let adminCtx
  try {
    // Owner-only — payouts are money Mark moves out of the business.
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

  let body: CreatePayoutBody
  try {
    body = (await request.json()) as CreatePayoutBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  if (!body.type || !ALLOWED_TYPES.has(body.type)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Type must be owner_payout or employee_payout',
      },
      { status: 400 }
    )
  }
  if (!body.paymentMethod || !isValidPaymentMethod(body.paymentMethod)) {
    return NextResponse.json(
      { success: false, error: 'Invalid payment method' },
      { status: 400 }
    )
  }
  const recipient = (body.recipient ?? '').trim()
  if (!recipient) {
    return NextResponse.json(
      { success: false, error: 'Recipient is required' },
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
  // Outflow — always negative.
  const amountCents = -Math.abs(Math.round(rawCents))

  const occurredOn = (body.occurredOn ?? '').trim()
  if (!isYMD(occurredOn)) {
    return NextResponse.json(
      { success: false, error: 'Date paid must be YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const periodStart = body.periodStart && isYMD(body.periodStart) ? body.periodStart : null
  const periodEnd = body.periodEnd && isYMD(body.periodEnd) ? body.periodEnd : null
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) {
    return NextResponse.json(
      { success: false, error: 'Provide both period start and end, or neither' },
      { status: 400 }
    )
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    return NextResponse.json(
      { success: false, error: 'Period start must be before period end' },
      { status: 400 }
    )
  }

  // Description is required on transactions; build a sensible default if the
  // admin only supplied notes (or nothing).
  const baseDesc =
    body.type === 'owner_payout'
      ? `Owner payout to ${recipient}`
      : `Employee payout to ${recipient}`
  const notesPart = body.notes && body.notes.trim() ? ` — ${body.notes.trim()}` : ''
  const description = `${baseDesc}${notesPart}`

  const supabase = createAdminClient()
  const { data: inserted, error: insertErr } = await supabase
    .from('transactions')
    .insert({
      type: body.type as 'owner_payout' | 'employee_payout',
      amount_cents: amountCents,
      occurred_on: occurredOn,
      description,
      payment_method: body.paymentMethod,
      payout_recipient: recipient,
      payout_period_start: periodStart,
      payout_period_end: periodEnd,
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
