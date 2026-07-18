// POST /api/admin/mc-bookings
// Staff logs a PHONE or WALK-IN (in_person) booking into the unified reporting
// ledger (mc_bookings). Online bookings flow in automatically on confirmation —
// this is only for the off-web channels, so channel is restricted to
// phone/in_person here. Additive + reporting-only: fires NOTHING to Meta.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { recordMcBooking } from '@/lib/mc-bookings'
import { isAttributionSource } from '@/lib/attribution'

export const runtime = 'nodejs'

interface Body {
  channel?: string // 'phone' | 'in_person'
  bookingDatetime?: string | null
  racers?: number | string | null
  durationHours?: number | string | null
  amount?: number | string | null // DOLLARS
  depositPaid?: number | string | null // DOLLARS
  isMembership?: boolean
  customerId?: string | null
  attributedSource?: string | null
  notes?: string | null
}

function toNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Online is auto-recorded on confirmation; this action is for off-web channels.
  if (body.channel !== 'phone' && body.channel !== 'in_person') {
    return NextResponse.json(
      { success: false, error: 'channel must be "phone" or "in_person"' },
      { status: 400 }
    )
  }

  const amount = toNum(body.amount)
  if (amount === null || amount < 0) {
    return NextResponse.json({ success: false, error: 'Enter a valid amount.' }, { status: 400 })
  }

  const attributedSource =
    body.attributedSource && isAttributionSource(body.attributedSource) ? body.attributedSource : null

  // recordMcBooking never throws; it backfills attributed_source from the linked
  // customer when we don't pass one explicitly.
  await recordMcBooking({
    channel: body.channel,
    bookingDatetime: body.bookingDatetime?.trim() || null,
    racers: toNum(body.racers),
    durationHours: toNum(body.durationHours),
    amountDollars: amount,
    depositDollars: toNum(body.depositPaid),
    isMembership: body.isMembership === true,
    customerId: body.customerId?.trim() || null,
    attributedSource,
    notes: body.notes?.trim() || null,
  })

  return NextResponse.json({ success: true })
}
