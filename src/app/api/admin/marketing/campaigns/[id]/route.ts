// PATCH  /api/admin/marketing/campaigns/[id] — edit a draft campaign.
// DELETE /api/admin/marketing/campaigns/[id] — delete a draft campaign.
//
// Both refuse to touch a campaign that has already been sent — sent campaigns
// are a historical record (and their sends/stats reference them).
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { composeInnerHtml } from '@/lib/marketing/render'

export const runtime = 'nodejs'

interface UpdateBody {
  name?: string
  subject?: string
  preheader?: string | null
  bodyText?: string
  ctaLabel?: string | null
  ctaUrl?: string | null
}

async function auth() {
  return requireAdmin(['owner', 'staff'])
}

function authError(err: unknown) {
  if (err instanceof AdminAuthError) {
    return NextResponse.json(
      { success: false, error: err.message, code: err.code },
      { status: err.code === 'unauthenticated' ? 401 : 403 }
    )
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await auth()
  } catch (err) {
    const r = authError(err)
    if (r) return r
    throw err
  }

  const { id } = await params
  let body: UpdateBody
  try {
    body = (await request.json()) as UpdateBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { data: campaign } = await supabase
    .from('marketing_campaigns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json(
      { success: false, error: 'Campaign not found' },
      { status: 404 }
    )
  }
  if (campaign.status !== 'draft') {
    return NextResponse.json(
      { success: false, error: 'Only draft campaigns can be edited' },
      { status: 400 }
    )
  }

  const name = (body.name ?? '').trim()
  const subject = (body.subject ?? '').trim()
  const bodyText = (body.bodyText ?? '').trim()
  const preheader = (body.preheader ?? '').trim() || null
  const ctaLabel = (body.ctaLabel ?? '').trim() || null
  const ctaUrl = (body.ctaUrl ?? '').trim() || null

  if (!name || !subject || !bodyText) {
    return NextResponse.json(
      { success: false, error: 'Name, subject, and message are all required' },
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

  const { error } = await supabase
    .from('marketing_campaigns')
    .update({
      name,
      subject,
      preheader,
      body_text: bodyText,
      body_html: bodyHtml,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
    })
    .eq('id', id)

  if (error) {
    return NextResponse.json(
      { success: false, error: `Update failed: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, id })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await auth()
  } catch (err) {
    const r = authError(err)
    if (r) return r
    throw err
  }

  const { id } = await params
  const supabase = createAdminClient()

  const { data: campaign } = await supabase
    .from('marketing_campaigns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json(
      { success: false, error: 'Campaign not found' },
      { status: 404 }
    )
  }
  if (campaign.status !== 'draft') {
    return NextResponse.json(
      { success: false, error: 'Only draft campaigns can be deleted' },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('marketing_campaigns')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json(
      { success: false, error: `Delete failed: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
