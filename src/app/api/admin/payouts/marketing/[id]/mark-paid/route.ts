// POST /api/admin/payouts/marketing/[id]/mark-paid
//
// Records that the Sweet Dreams marketing payout for a given calculation row
// has been paid out. Owner-only — staff and the Sweet Dreams role can't move
// money. Creates a marketing_payout transaction with a negative amount (money
// leaving the books) and back-links it from the calculation row so the
// transaction and the breakdown stay tied together.
//
// We don't try to make this atomic in the strict sense — Supabase REST has no
// transaction primitive — but we insert the transaction FIRST, then update the
// calculation row. If the second step fails the transaction sits there as a
// regular ledger entry that an owner can clean up manually, which is better
// than the inverse (marked paid with no money record).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Get today's date in Eastern time as YYYY-MM-DD. Same reasoning as the
// recalculate endpoint: the books are kept on Fort Wayne local time.
function todayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

// Month names for the transaction description. Indexed 1-12 with index 0
// intentionally unused for cleaner call-sites (no need to subtract 1).
const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'Missing calculation id' }, { status: 400 })
  }

  // ---- Auth gate (owner only) ---------------------------------------------
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: adminUser, error: adminLookupErr } = await admin
    .from('admin_users')
    .select('id, role, active')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (adminLookupErr || !adminUser || !adminUser.active) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }
  if (adminUser.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the owner can mark a marketing payout as paid' },
      { status: 403 }
    )
  }

  // ---- Load the calculation row -------------------------------------------
  const { data: calc, error: calcErr } = await admin
    .from('marketing_payout_calculations')
    .select('id, period_year, period_month, computed_payout_cents, paid, paid_transaction_id')
    .eq('id', id)
    .maybeSingle()

  if (calcErr) {
    return NextResponse.json(
      { error: `Failed to load calculation: ${calcErr.message}` },
      { status: 500 }
    )
  }
  if (!calc) {
    return NextResponse.json({ error: 'Calculation not found' }, { status: 404 })
  }
  if (calc.paid) {
    return NextResponse.json(
      { error: 'This payout has already been marked paid' },
      { status: 409 }
    )
  }
  if (calc.computed_payout_cents <= 0) {
    // The 0% band can produce a $0 payout for slow months — refuse to write
    // a $0 ledger entry. Mark the row paid directly instead so the UI
    // reflects "settled" without polluting transactions.
    const { error: zeroUpdateErr } = await admin
      .from('marketing_payout_calculations')
      .update({ paid: true, paid_transaction_id: null })
      .eq('id', id)
    if (zeroUpdateErr) {
      return NextResponse.json(
        { error: `Failed to mark zero-payout as paid: ${zeroUpdateErr.message}` },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true, transaction_id: null, zero_payout: true })
  }

  // ---- Insert the marketing_payout transaction -----------------------------
  const monthName = MONTH_NAMES[calc.period_month] ?? `Month ${calc.period_month}`
  const periodLabel = `${monthName} ${calc.period_year}`
  const occurredOn = todayEastern()

  const { data: txRow, error: txErr } = await admin
    .from('transactions')
    .insert({
      type: 'marketing_payout',
      // Stored as a negative number — money leaving the books.
      amount_cents: -Math.abs(calc.computed_payout_cents),
      description: `Sweet Dreams marketing payout — ${periodLabel}`,
      occurred_on: occurredOn,
      payment_method: 'other',
      payout_recipient: 'Sweet Dreams Music LLC',
      // Use the calendar month as the payout period for auditability —
      // anyone scanning the ledger can see exactly which month this paid out.
      payout_period_start: `${calc.period_year}-${String(calc.period_month).padStart(2, '0')}-01`,
      payout_period_end: occurredOn,
      created_by_user_id: adminUser.id,
    })
    .select('id')
    .single()

  if (txErr || !txRow) {
    return NextResponse.json(
      { error: `Failed to record transaction: ${txErr?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  // ---- Flip the calculation row to paid -----------------------------------
  const { error: updateErr } = await admin
    .from('marketing_payout_calculations')
    .update({
      paid: true,
      paid_transaction_id: txRow.id,
    })
    .eq('id', id)

  if (updateErr) {
    // The transaction is already written; surface this loudly so the owner
    // knows the books are correct but the calculation row is stale.
    return NextResponse.json(
      {
        error:
          `Transaction recorded (id ${txRow.id}) but failed to flip ` +
          `calculation to paid: ${updateErr.message}. Please update manually.`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, transaction_id: txRow.id })
}
