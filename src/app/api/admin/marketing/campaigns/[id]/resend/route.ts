// POST /api/admin/marketing/campaigns/[id]/resend
// Retry a campaign for everyone who DIDN'T receive it — failed sends, sends that
// only got queued (a blast that died mid-run), and audience members never
// attempted. Never re-mails anyone who already got it: sendCampaign's
// per-recipient skip logic only sends to customers without a successful send
// row. Safe to click repeatedly.
//
// Separate from /send so the normal "Send Campaign" button keeps its hard guard
// against re-blasting a completed campaign; resend is the explicit, gap-filling
// counterpart (force: true).
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCampaign } from '@/lib/marketing/send'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(
  _request: NextRequest,
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
  const supabase = createAdminClient()

  const { data: campaign } = await supabase
    .from('marketing_campaigns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
  }
  // Only makes sense for a campaign that already ran. A draft uses /send; an
  // in-flight 'sending' campaign is already covering the gaps.
  if (campaign.status !== 'sent' && campaign.status !== 'failed') {
    return NextResponse.json(
      { success: false, error: 'Resend only applies to a campaign that has already been sent.' },
      { status: 400 }
    )
  }

  // Flip to 'sending' so the UI shows in-flight state and a double-click can't
  // launch two concurrent resends.
  await supabase.from('marketing_campaigns').update({ status: 'sending' }).eq('id', id)

  waitUntil(
    sendCampaign(id, { force: true }).catch(async (err) => {
      console.error(`[marketing] resend ${id} failed:`, err)
      try {
        await supabase.from('marketing_campaigns').update({ status: 'failed' }).eq('id', id)
      } catch (e) {
        console.error(`[marketing] could not mark campaign ${id} failed:`, e)
      }
    })
  )

  return NextResponse.json({ success: true, started: true })
}
