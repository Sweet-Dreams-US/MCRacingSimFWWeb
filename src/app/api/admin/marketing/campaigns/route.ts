// POST /api/admin/marketing/campaigns — create a draft campaign.
//
// Stores both the owner's raw composer fields (body_text / cta_*) for later
// editing AND the rendered inner HTML (body_html) used at send time.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeInnerHtml } from '@/lib/marketing/render'

export const runtime = 'nodejs'

interface CreateCampaignBody {
  name?: string
  subject?: string
  preheader?: string | null
  bodyText?: string
  ctaLabel?: string | null
  ctaUrl?: string | null
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

  let body: CreateCampaignBody
  try {
    body = (await request.json()) as CreateCampaignBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const name = (body.name ?? '').trim()
  const subject = (body.subject ?? '').trim()
  const bodyText = (body.bodyText ?? '').trim()
  const preheader = (body.preheader ?? '').trim() || null
  const ctaLabel = (body.ctaLabel ?? '').trim() || null
  const ctaUrl = (body.ctaUrl ?? '').trim() || null

  if (!name) {
    return NextResponse.json(
      { success: false, error: 'Campaign name is required' },
      { status: 400 }
    )
  }
  if (!subject) {
    return NextResponse.json(
      { success: false, error: 'Subject line is required' },
      { status: 400 }
    )
  }
  if (!bodyText) {
    return NextResponse.json(
      { success: false, error: 'Message body is required' },
      { status: 400 }
    )
  }
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) {
    return NextResponse.json(
      { success: false, error: 'Button link must start with http:// or https://' },
      { status: 400 }
    )
  }

  const bodyHtml = composeInnerHtml({ bodyText, ctaLabel, ctaUrl })

  const supabase = createAdminClient()
  const { data: inserted, error } = await supabase
    .from('marketing_campaigns')
    .insert({
      name,
      subject,
      preheader,
      body_text: bodyText,
      body_html: bodyHtml,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      status: 'draft',
      created_by_user_id: adminCtx.admin.id,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return NextResponse.json(
      { success: false, error: `Create failed: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id: inserted.id })
}
