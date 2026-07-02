// POST /api/admin/parties/invite
// Admin creates a party invite (birthday / corporate / group). Computes the
// 50% deposit, stores the party, and emails the customer a pay link.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { getDayType } from '@/lib/pricing'
import { createPartyInvite, isPartyType } from '@/lib/parties'

export const runtime = 'nodejs'

interface Body {
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  partyType?: string
  sessionDate?: string
  startTime?: string
  headcount?: number | string
  totalPrice?: number | string // dollars
  notes?: string
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

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const contactName = (body.contactName ?? '').trim()
  const contactEmail = (body.contactEmail ?? '').trim().toLowerCase()
  const partyType = (body.partyType ?? '').trim()
  const sessionDate = (body.sessionDate ?? '').trim()
  const startTime = (body.startTime ?? '').trim()
  const headcount = Math.round(Number(body.headcount))
  const totalDollars = Number(body.totalPrice)

  if (!contactName) return bad('Enter the customer’s name.')
  if (!contactEmail.includes('@')) return bad('Enter a valid email.')
  if (!isPartyType(partyType)) return bad('Choose a party type.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return bad('Choose a valid date.')
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime)) return bad('Choose a valid start time.')
  if (getDayType(sessionDate) === 'closed') return bad('The venue is closed Mondays — pick another day.')
  if (!Number.isFinite(headcount) || headcount < 1) return bad('Enter the number of guests.')
  if (!Number.isFinite(totalDollars) || totalDollars <= 0) return bad('Enter the total price.')

  try {
    const result = await createPartyInvite({
      contactName,
      contactEmail,
      contactPhone: (body.contactPhone ?? '').trim() || null,
      partyType,
      sessionDate,
      startTime,
      headcount,
      totalPriceCents: Math.round(totalDollars * 100),
      notes: (body.notes ?? '').trim() || null,
      createdByUserId: adminCtx.admin.id,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('Party invite error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to create party invite' },
      { status: 500 }
    )
  }
}

function bad(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 })
}
