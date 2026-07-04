// DELETE /api/admin/availability/[id] — remove an availability block, making
// those slots bookable online again.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin(['owner', 'staff'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.code === 'unauthenticated' ? 401 : 403 }
      )
    }
    throw err
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('availability_blocks')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json(
      { success: false, error: `Delete failed: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
