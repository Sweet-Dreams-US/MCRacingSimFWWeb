// POST /api/terminal/cash_payment
// Record a CASH payment from the reader (no card run) — e.g. a customer pays
// cash for part or all of a booking. Writes a transaction to the same books the
// web POS uses. Device-key auth.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDeviceAuthorized } from '@/lib/device-auth'
import { findOrCreateCustomerIdByEmail } from '@/lib/customers'
import { computeTaxCents } from '@/lib/tax'

export const runtime = 'nodejs'

type SaleType = 'in_person_sale' | 'booking_income' | 'other_income'
const VALID_TYPES: SaleType[] = ['in_person_sale', 'booking_income', 'other_income']

function getTodayEastern(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

interface Body {
  bookingId?: string | null
  customerId?: string | null
  amountCents?: number
  description?: string
  receiptEmail?: string | null
  saleType?: SaleType
  // Split payments: when true, amountCents is the EXACT cash amount (already
  // tax-inclusive) and taxCents is its tax portion — we don't add tax.
  amountIncludesTax?: boolean
  taxCents?: number
}

export async function POST(request: NextRequest) {
  if (!isDeviceAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const amountCents = body.amountCents
  if (!Number.isInteger(amountCents) || (amountCents as number) < 1) {
    return NextResponse.json({ success: false, error: 'Amount must be positive' }, { status: 400 })
  }
  const bookingId = (body.bookingId ?? '').trim() || null
  const description = (body.description ?? '').trim() || 'Cash payment'
  const type: SaleType = VALID_TYPES.includes(body.saleType as SaleType)
    ? (body.saleType as SaleType)
    : bookingId
      ? 'booking_income'
      : 'in_person_sale'

  const supabase = createAdminClient()

  // Link a customer: explicit id, else find-or-create by email.
  let customerId = (body.customerId ?? '').trim() || null
  if (!customerId && body.receiptEmail) {
    customerId = await findOrCreateCustomerIdByEmail(supabase, body.receiptEmail)
  }

  // Sales tax. Normally amountCents is the pre-tax subtotal; add tax and record
  // the total. For a split's cash half, amountCents is already the exact (tax-
  // inclusive) amount and taxCents is its portion — don't re-add.
  let totalCents: number
  let taxCents: number
  if (body.amountIncludesTax) {
    totalCents = amountCents as number
    taxCents = Math.max(0, Math.min(totalCents, Math.round(body.taxCents ?? 0)))
  } else {
    const subtotalCents = amountCents as number
    taxCents = computeTaxCents(subtotalCents)
    totalCents = subtotalCents + taxCents
  }

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      type,
      amount_cents: totalCents,
      tax_cents: taxCents,
      occurred_on: getTodayEastern(),
      description,
      payment_method: 'cash',
      booking_id: bookingId,
      customer_id: customerId,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return NextResponse.json(
      { success: false, error: `Insert failed: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, transactionId: inserted.id })
}
