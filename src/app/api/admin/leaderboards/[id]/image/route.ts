// POST   /api/admin/leaderboards/[id]/image  — upload a track map or photo.
// DELETE /api/admin/leaderboards/[id]/image?kind=map|photo — remove it.
//
// Two image slots per board: `map` (schematic track map, usually a PNG) and
// `photo` (a wide scenic shot). Both live in the PUBLIC `track-photos` bucket
// so the leaderboard page can render them by URL; the resulting public URL is
// stored on leaderboards.map_image_url / .photo_image_url.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, AdminAuthError } from '@/lib/admin-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

export const runtime = 'nodejs'

type BoardUpdate = Database['public']['Tables']['leaderboards']['Update']
function imagePatch(kind: 'map' | 'photo', url: string | null): BoardUpdate {
  return kind === 'map' ? { map_image_url: url } : { photo_image_url: url }
}

const BUCKET = 'track-photos'
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
}
const COLUMN = { map: 'map_image_url', photo: 'photo_image_url' } as const
type Kind = keyof typeof COLUMN

function parseKind(v: unknown): Kind | null {
  return v === 'map' || v === 'photo' ? v : null
}

async function auth() {
  try {
    await requireAdmin(['owner', 'staff'])
    return null
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 403 })
    }
    throw err
  }
}

/** Best-effort: pull the object path back out of a stored public URL. */
function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : url.slice(i + marker.length)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { id } = await params

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ success: false, error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const kind = parseKind(form.get('kind'))
  if (!kind) {
    return NextResponse.json({ success: false, error: 'kind must be "map" or "photo"' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ success: false, error: 'File is empty' }, { status: 400 })
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ success: false, error: 'File exceeds 10MB limit' }, { status: 400 })
  }
  const ext = EXT_BY_TYPE[file.type]
  if (!ext) {
    return NextResponse.json(
      { success: false, error: `Unsupported type "${file.type}". Use PNG, JPG, WebP, or HEIC.` },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Remember the old object so we can clean it up after a successful replace.
  const { data: board } = await supabase
    .from('leaderboards')
    .select('map_image_url, photo_image_url')
    .eq('id', id)
    .maybeSingle()
  if (!board) {
    return NextResponse.json({ success: false, error: 'Leaderboard not found' }, { status: 404 })
  }
  const oldPath = pathFromPublicUrl(board[COLUMN[kind]])

  const path = `${id}/${kind}-${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false })
  if (uploadErr) {
    return NextResponse.json({ success: false, error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error: updateErr } = await supabase
    .from('leaderboards')
    .update(imagePatch(kind, publicUrl))
    .eq('id', id)
  if (updateErr) {
    // Roll back the orphaned upload so we don't leave a file with no reference.
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }

  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPath]) // best-effort
  }

  return NextResponse.json({ success: true, url: publicUrl, kind })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await auth()
  if (denied) return denied
  const { id } = await params

  const kind = parseKind(request.nextUrl.searchParams.get('kind'))
  if (!kind) {
    return NextResponse.json({ success: false, error: 'kind must be "map" or "photo"' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: board } = await supabase
    .from('leaderboards')
    .select('map_image_url, photo_image_url')
    .eq('id', id)
    .maybeSingle()
  if (!board) {
    return NextResponse.json({ success: false, error: 'Leaderboard not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('leaderboards')
    .update(imagePatch(kind, null))
    .eq('id', id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const oldPath = pathFromPublicUrl(board[COLUMN[kind]])
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]) // best-effort

  return NextResponse.json({ success: true })
}
