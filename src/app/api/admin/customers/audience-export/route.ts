// GET /api/admin/customers/audience-export
// Downloads the Meta Custom Audience seed list as a CSV.
//
// EMAIL ONLY - see src/lib/marketing/audience-export.ts for why there is no
// phone column and why that is not negotiable (10DLC/A2P disclosure).
//
// Owner-only. This exports every marketable customer email we hold in one file,
// which is a materially bigger disclosure than any other admin read, so staff
// accounts cannot pull it.
import { NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildCustomerListCsv,
  audienceExportFilename,
} from '@/lib/marketing/audience-export'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdmin(['owner'])
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }

  try {
    const { csv, count, estimatedMatches, clearsLookalikeFloor } =
      await buildCustomerListCsv(createAdminClient())

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${audienceExportFilename()}"`,
        // Never let a proxy or the browser hold a copy of a customer list.
        'Cache-Control': 'no-store, private',
        // Surfaced in the response so the caller can sanity-check the export
        // without opening the file.
        'X-Audience-Count': String(count),
        'X-Audience-Estimated-Matches': String(estimatedMatches),
        'X-Audience-Clears-Lookalike-Floor': String(clearsLookalikeFloor),
      },
    })
  } catch (err) {
    console.error('Audience export failed:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Export failed' },
      { status: 500 }
    )
  }
}
