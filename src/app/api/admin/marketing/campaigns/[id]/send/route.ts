// POST /api/admin/marketing/campaigns/[id]/send
// Blast a draft campaign to the whole emailable audience.
//
// The send loop (10s–60s for our list) runs in the BACKGROUND via waitUntil so
// the HTTP response returns immediately — the admin UI then polls campaign
// status. We learned the hard way that fire-and-forget WITHOUT waitUntil gets
// frozen when the serverless function returns; waitUntil keeps it alive.
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCampaign } from '@/lib/marketing/send'

export const runtime = 'nodejs'
// Give the background blast room to finish even for a larger list.
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
    return NextResponse.json(
      { success: false, error: 'Campaign not found' },
      { status: 404 }
    )
  }
  // Refuse to re-blast a completed campaign — prevents accidental double-sends.
  if (campaign.status === 'sent') {
    return NextResponse.json(
      { success: false, error: 'This campaign has already been sent' },
      { status: 400 }
    )
  }

  // Flip to "sending" synchronously so the UI reflects state immediately and a
  // double-click can't launch two blasts.
  await supabase
    .from('marketing_campaigns')
    .update({ status: 'sending' })
    .eq('id', id)

  // Run the actual blast in the background; the function stays alive via waitUntil.
  waitUntil(
    sendCampaign(id).catch((err) => {
      console.error(`[marketing] sendCampaign ${id} failed:`, err)
    })
  )

  return NextResponse.json({ success: true, started: true })
}
