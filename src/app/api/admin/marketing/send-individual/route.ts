// POST /api/admin/marketing/send-individual
// Send one personalized marketing email to a single customer (from their detail
// page). Honors suppression — a customer who unsubscribed/bounced is skipped.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { sendIndividual } from '@/lib/marketing/send'
import { composeInnerHtml } from '@/lib/marketing/render'

export const runtime = 'nodejs'

interface Body {
  customerId?: string
  subject?: string
  message?: string
  preheader?: string | null
  ctaLabel?: string | null
  ctaUrl?: string | null
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(['owner', 'staff'])
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
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const customerId = (body.customerId ?? '').trim()
  const subject = (body.subject ?? '').trim()
  const message = (body.message ?? '').trim()
  const preheader = (body.preheader ?? '').trim() || null
  const ctaLabel = (body.ctaLabel ?? '').trim() || null
  const ctaUrl = (body.ctaUrl ?? '').trim() || null

  if (!customerId) {
    return NextResponse.json(
      { success: false, error: 'customerId is required' },
      { status: 400 }
    )
  }
  if (!subject || !message) {
    return NextResponse.json(
      { success: false, error: 'Subject and message are required' },
      { status: 400 }
    )
  }
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return NextResponse.json(
      { success: false, error: 'Button link must start with http:// or https://' },
      { status: 400 }
    )
  }

  const innerHtml = composeInnerHtml({ bodyText: message, ctaLabel, ctaUrl })

  const result = await sendIndividual({ customerId, subject, innerHtml, preheader })

  if (!result.ok) {
    if (result.skippedReason) {
      return NextResponse.json(
        { success: false, skipped: true, error: result.skippedReason },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: result.error ?? 'Send failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true })
}
