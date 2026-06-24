// POST /api/admin/expenses/upload-receipt
//
// Accepts a single file via multipart/form-data and uploads it to the private
// `receipts` Supabase Storage bucket. Returns the storage path so the caller
// can store it in transactions.receipt_url. The bucket is PRIVATE — callers
// that want to render the file should issue a short-lived signed URL.
//
// File constraints (enforced both here and at the bucket level):
//   - 10 MB max
//   - image/jpeg, image/png, image/heic, image/webp, application/pdf
//
// Path layout: `{admin_user_id}/{epoch_ms}-{slug}.{ext}` — namespaces by who
// uploaded it, keeps filenames unique, sanitizes the original name so the
// path is URL-safe.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
])

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

function sanitizeStem(name: string): string {
  // Strip extension, lowercase, replace non-alphanumerics with hyphens,
  // collapse and trim. Cap at 40 chars so the full path stays reasonable.
  const stem = name.replace(/\.[^.]+$/, '')
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'receipt'
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

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Expected multipart/form-data' },
      { status: 400 }
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: 'Missing file field' },
      { status: 400 }
    )
  }

  if (file.size === 0) {
    return NextResponse.json(
      { success: false, error: 'File is empty' },
      { status: 400 }
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: 'File exceeds 10MB limit' },
      { status: 400 }
    )
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported file type "${file.type}". Allowed: JPG, PNG, HEIC, WebP, PDF.`,
      },
      { status: 400 }
    )
  }

  const ext = EXT_BY_TYPE[file.type] ?? 'bin'
  const stem = sanitizeStem(file.name || 'receipt')
  const path = `${adminCtx.admin.id}/${Date.now()}-${stem}.${ext}`

  const supabase = createAdminClient()
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, arrayBuffer, {
      contentType: file.type,
      // Each upload gets a unique timestamped path, so collisions are
      // effectively impossible — upsert false to fail loudly if one happens.
      upsert: false,
    })

  if (uploadErr) {
    return NextResponse.json(
      { success: false, error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, path })
}
