// Blog data layer.
//
// Posts are markdown files with front matter in content/blog/YYYY-MM-DD-<slug>.md.
// Nothing is baked into the code and nothing is read at build time only: the
// blog pages revalidate hourly and compare each post's release_on with today's
// date in Fort Wayne time at render time, so a post appears on its day without
// a deploy. Only the Node runtime reads these files (server components, route
// handlers), never client code.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const SITE_URL = 'https://mcracingfortwayne.com'
export const BLOG_DIR = path.join(process.cwd(), 'content', 'blog')
export const BLOG_TIME_ZONE = 'America/Indiana/Indianapolis'

export interface BlogSource {
  title: string
  author?: string
  url: string
}

export interface BlogPost {
  post_id: string
  seq: number
  title: string
  slug: string
  /** YYYY-MM-DD. Compared as a plain string with today's Fort Wayne date. */
  release_on: string
  description: string
  reading_minutes: number
  /** Path relative to content/blog, for example images/<slug>/cover.jpg. */
  cover_image?: string
  topic_id?: string
  sources: BlogSource[]
  /** Markdown after the front matter block, exactly as stored. */
  body: string
}

/* ------------------------------------------------------------------ Dates */

/** Today's date in Fort Wayne time as YYYY-MM-DD. */
export function todayInFortWayne(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BLOG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Visible on and after release_on. A post without a date is never visible. */
export function isReleased(post: Pick<BlogPost, 'release_on'>, today: string = todayInFortWayne()): boolean {
  return Boolean(post.release_on) && post.release_on <= today
}

/** "November 2, 2026" from a YYYY-MM-DD string. */
export function formatReleaseDate(releaseOn: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${releaseOn}T00:00:00Z`))
}

/* ------------------------------------------------------------ Front matter */

function unquote(value: string): string {
  const v = value.trim()
  if (v.length >= 2) {
    if (v.startsWith('"') && v.endsWith('"')) {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    if (v.startsWith("'") && v.endsWith("'")) {
      return v.slice(1, -1).replace(/''/g, "'")
    }
  }
  return v
}

type FrontMatterValue = string | Record<string, string>[]

/**
 * A small parser for the fixed front matter shape in BLOG-FORMAT.md: scalar
 * keys, plus one list of maps for `sources`. The file format is a contract we
 * control on both ends, so this does not try to be general YAML.
 */
export function parseFrontMatter(raw: string): Record<string, FrontMatterValue> {
  const lines = raw.split('\n')
  const result: Record<string, FrontMatterValue> = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
    if (!m) {
      i++
      continue
    }
    const key = m[1]
    const rest = m[2].trim()
    if (rest !== '') {
      result[key] = rest === '[]' ? [] : unquote(rest)
      i++
      continue
    }
    // Empty value: an indented list of maps may follow (sources).
    const items: Record<string, string>[] = []
    let j = i + 1
    while (j < lines.length && /^\s*-\s/.test(lines[j])) {
      const item: Record<string, string> = {}
      const first = lines[j].match(/^\s*-\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
      if (first) item[first[1]] = unquote(first[2])
      j++
      while (j < lines.length && /^\s+[A-Za-z_]/.test(lines[j]) && !/^\s*-\s/.test(lines[j])) {
        const kv = lines[j].match(/^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/)
        if (kv) item[kv[1]] = unquote(kv[2])
        j++
      }
      items.push(item)
    }
    if (items.length > 0) {
      result[key] = items
      i = j
    } else {
      result[key] = ''
      i++
    }
  }
  return result
}

/** Parse one post file. Returns null when it is not a usable post. */
export function parsePost(filename: string, source: string): BlogPost | null {
  const raw = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const match = raw.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/)
  if (!match) {
    console.error(`[blog] ${filename}: no front matter block`)
    return null
  }
  const fm = parseFrontMatter(match[1])
  const str = (k: string) => (typeof fm[k] === 'string' ? (fm[k] as string).trim() : '')

  const post_id = str('post_id')
  const title = str('title')
  const slug = str('slug')
  if (!post_id || !title || !slug || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) {
    console.error(`[blog] ${filename}: missing or invalid post_id, title or slug`)
    return null
  }

  const dateMatch = str('release_on').match(/^\d{4}-\d{2}-\d{2}/)
  const release_on = dateMatch ? dateMatch[0] : ''

  const body = match[2].trim()
  const rawSources = fm.sources
  const sources: BlogSource[] = Array.isArray(rawSources)
    ? rawSources
        .filter(s => s.title && s.url)
        .map(s => ({ title: s.title, author: s.author || undefined, url: s.url }))
    : []

  const words = body.split(/\s+/).filter(Boolean).length
  const reading_minutes = parseInt(str('reading_minutes'), 10) || Math.max(1, Math.round(words / 200))

  return {
    post_id,
    seq: parseInt(str('seq'), 10) || 0,
    title,
    slug,
    release_on,
    description: str('description'),
    reading_minutes,
    cover_image: str('cover_image') || undefined,
    topic_id: str('topic_id') || undefined,
    sources,
    body,
  }
}

/* ------------------------------------------------------------------- Disk */

async function readAllPosts(dir: string = BLOG_DIR): Promise<BlogPost[]> {
  let files: string[]
  try {
    files = (await readdir(dir)).filter(f => f.endsWith('.md') && !f.startsWith('.'))
  } catch (err) {
    // No content/blog folder means no posts yet. Anything else is a real
    // failure and should surface, so a hiccup keeps the last good page
    // instead of publishing an empty blog.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const parsed = await Promise.all(
    files.map(async file => parsePost(file, await readFile(path.join(dir, file), 'utf8'))),
  )
  // One post per post_id. A dated copy wins over an undated one.
  const byId = new Map<string, BlogPost>()
  for (const p of parsed) {
    if (!p) continue
    const existing = byId.get(p.post_id)
    if (!existing || (!existing.release_on && p.release_on)) byId.set(p.post_id, p)
  }
  return Array.from(byId.values())
}

/** Newest release first; the later sequence number first on the same day. */
export function sortNewestFirst<T extends Pick<BlogPost, 'release_on' | 'seq'>>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    if (a.release_on !== b.release_on) return a.release_on < b.release_on ? 1 : -1
    return b.seq - a.seq
  })
}

/** Posts whose release date has arrived, newest first. Index, feed and sitemap use this. */
export async function getReleasedPosts(now: Date = new Date()): Promise<BlogPost[]> {
  const today = todayInFortWayne(now)
  const posts = await readAllPosts()
  return sortNewestFirst(posts.filter(p => isReleased(p, today)))
}

/** One released post, or null (404) when it does not exist or is not due yet. */
export async function getReleasedPost(slug: string): Promise<BlogPost | null> {
  const posts = await getReleasedPosts()
  return posts.find(p => p.slug === slug) ?? null
}

/** True once at least one post has been released. Drives the Blog nav link. */
export async function hasReleasedPosts(): Promise<boolean> {
  return (await getReleasedPosts()).length > 0
}
