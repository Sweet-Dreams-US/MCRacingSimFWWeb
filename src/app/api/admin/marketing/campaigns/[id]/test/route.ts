// POST /api/admin/marketing/campaigns/[id]/test
// Send a one-off test of this campaign to a given address so the owner can see
// exactly what lands in the inbox (rendering, deliverability) before blasting
// the real list. Uses sample merge values and a throwaway unsubscribe token.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOne } from '@/lib/marketing/send'
import { applyMergeFields, applyMergeFieldsText, mergeVarsFor, type MergeVars } from '@/lib/marketing/render'

export const runtime = 'nodejs'

// Used when no real customer is chosen — makes {{firstName}} an obvious sample.
const SAMPLE_VARS: MergeVars = { firstName: 'Alex', lastName: 'Driver', fullName: 'Alex Driver' }
const THROWAWAY_TOKEN = '00000000-0000-0000-0000-000000000000'

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
  let customerId: string | null = null
  try {
    const body = (await request.json()) as { email?: string; customerId?: string | null }
    to = (body.email ?? '').trim()
    customerId = body.customerId?.trim() || null
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

  // If a real customer was chosen, render with THEIR name + real unsubscribe
  // token so the test is a faithful preview of what that customer receives.
  // The email still goes to `to` (the admin's inbox), never the customer.
  let vars: MergeVars = SAMPLE_VARS
  let unsubscribeToken = THROWAWAY_TOKEN
  let renderedAs: string | null = null
  if (customerId) {
    const { data: cust } = await supabase
      .from('customers')
      .select('first_name, last_name, unsubscribe_token')
      .eq('id', customerId)
      .maybeSingle()
    if (!cust) {
      return NextResponse.json(
        { success: false, error: 'Selected customer not found' },
        { status: 404 }
      )
    }
    vars = mergeVarsFor(cust)
    unsubscribeToken = cust.unsubscribe_token
    renderedAs = vars.fullName || vars.firstName
  }

  const result = await sendOne({
    to,
    subject: `[TEST] ${applyMergeFieldsText(campaign.subject, vars)}`,
    innerHtml: applyMergeFields(campaign.body_html, vars),
    preheader: campaign.preheader
      ? applyMergeFieldsText(campaign.preheader, vars)
      : null,
    unsubscribeToken,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error ?? 'Send failed' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, renderedAs })
}
