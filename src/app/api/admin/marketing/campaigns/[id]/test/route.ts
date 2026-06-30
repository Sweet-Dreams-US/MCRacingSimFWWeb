// POST /api/admin/marketing/campaigns/[id]/test
// Send a one-off test of this campaign to a given address so the owner can see
// exactly what lands in the inbox (rendering, deliverability) before blasting
// the real list. Uses sample merge values and a throwaway unsubscribe token.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOne } from '@/lib/marketing/send'
import { applyMergeFields, applyMergeFieldsText } from '@/lib/marketing/render'

export const runtime = 'nodejs'

const SAMPLE_VARS = { firstName: 'Alex', lastName: 'Driver', fullName: 'Alex Driver' }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params
  let to = ''
  try {
    const body = (await request.json()) as { email?: string }
    to = (body.email ?? '').trim()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  if (!to || !to.includes('@')) {
    return NextResponse.json(
      { success: false, error: 'A valid test email address is required' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { data: campaign } = await supabase
    .from('marketing_campaigns')
    .select('subject, preheader, body_html')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json(
      { success: false, error: 'Campaign not found' },
      { status: 404 }
    )
  }

  const result = await sendOne({
    to,
    subject: `[TEST] ${applyMergeFieldsText(campaign.subject, SAMPLE_VARS)}`,
    innerHtml: applyMergeFields(campaign.body_html, SAMPLE_VARS),
    preheader: campaign.preheader
      ? applyMergeFieldsText(campaign.preheader, SAMPLE_VARS)
      : null,
    // Throwaway token — the test's unsubscribe link won't match a real customer.
    unsubscribeToken: '00000000-0000-0000-0000-000000000000',
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error ?? 'Send failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true })
}
