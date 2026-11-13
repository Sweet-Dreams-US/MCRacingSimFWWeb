import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BLOG_DIR, getReleasedPosts } from '@/lib/blog'

// Images for a post live in content/blog/images/<slug>/. They are served only
// once that post is released, so a cover image cannot leak before its date.
export const revalidate = 3600

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
}

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const [slug, ...rest] = params.path
  if (!slug || rest.length === 0 || params.path.some(seg => seg === '..' || seg === '.' || seg.includes('\\'))) {
    return new Response('Not found', { status: 404 })
  }
  const type = TYPES[path.extname(rest[rest.length - 1]).toLowerCase()]
  if (!type) return new Response('Not found', { status: 404 })

  const posts = await getReleasedPosts()
  if (!posts.some(p => p.slug === slug)) return new Response('Not found', { status: 404 })

  const imagesRoot = path.join(BLOG_DIR, 'images')
  const file = path.join(imagesRoot, slug, ...rest)
  if (!file.startsWith(imagesRoot + path.sep)) return new Response('Not found', { status: 404 })

  try {
    const data = await readFile(file)
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
