// Turns a post's markdown body into what the post page renders:
//   - a list of blocks: plain HTML runs and :::tip / :::note callouts
//   - the table of contents, built from the ## headings
//
// The markdown is parsed with marked. Raw HTML in a post is escaped rather than
// passed through, and only http(s), mailto, tel and site-relative links survive.
// A link inside a :::tip is lifted out of the text so the page can show it as a
// button under the tip.

import { Marked, type Token, type Tokens } from 'marked'

export interface TocHeading {
  id: string
  text: string
}

export interface CalloutLink {
  text: string
  href: string
}

export type BodyBlock =
  | { type: 'html'; html: string }
  | { type: 'callout'; kind: 'tip' | 'note'; title: string; html: string; links: CalloutLink[] }

export interface RenderedBody {
  blocks: BodyBlock[]
  headings: TocHeading[]
}

/* ----------------------------------------------------------------- helpers */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href.trim())
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href.trim())
}

function slugify(text: string): string {
  const base = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'section'
}

/** Plain text of a run of inline tokens. */
function plainText(tokens: Token[] | undefined): string {
  if (!tokens) return ''
  return tokens
    .map(t => {
      if ('tokens' in t && t.tokens) return plainText(t.tokens)
      if ('text' in t && typeof t.text === 'string') return t.text
      return ''
    })
    .join('')
}

type IdHeading = Tokens.Heading & { blogId?: string }

function createMarked(): Marked {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // Never pass raw HTML from a post through to the page.
      html({ text }) {
        return escapeHtml(text)
      },
      heading(token) {
        const { tokens, depth } = token as IdHeading
        const id = (token as IdHeading).blogId
        const inner = this.parser.parseInline(tokens)
        return id ? `<h${depth} id="${id}">${inner}</h${depth}>\n` : `<h${depth}>${inner}</h${depth}>\n`
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens)
        if (!isSafeHref(href)) return inner
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        const external = isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${escapeHtml(href)}"${titleAttr}${external}>${inner}</a>`
      },
      image({ href, title, text }) {
        // Post images live in content/blog/images/<slug>/ and are served from
        // /blog/images/<slug>/. A relative path in a post maps there.
        let src = href.trim()
        if (!/^(https?:\/\/|\/)/i.test(src)) src = `/blog/${src.replace(/^\.?\//, '')}`
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" decoding="async">`
      },
    },
  })
}

/* ---------------------------------------------------- tip link extraction */

function isBlankText(t: Token): boolean {
  return t.type === 'text' && typeof t.text === 'string' && t.text.trim() === ''
}

/**
 * Pull links out of a run of inline tokens. A link that closes the paragraph
 * is removed (it becomes a button). A link in the middle of a sentence keeps
 * its words as plain text so the sentence still reads.
 */
function liftLinks(inline: Token[], links: CalloutLink[]): Token[] {
  const out: Token[] = []
  for (let i = 0; i < inline.length; i++) {
    const t = inline[i]
    if (t.type === 'link') {
      const link = t as Tokens.Link
      if (isSafeHref(link.href)) {
        links.push({ text: plainText(link.tokens).trim() || link.href, href: link.href.trim() })
      }
      const trailing = inline.slice(i + 1).every(isBlankText)
      if (!trailing) out.push(...liftLinks(link.tokens, []))
      continue
    }
    if ('tokens' in t && Array.isArray(t.tokens) && (t.type === 'strong' || t.type === 'em' || t.type === 'del')) {
      out.push({ ...t, tokens: liftLinks(t.tokens, links) } as Token)
      continue
    }
    out.push(t)
  }
  // Trim whitespace left at the end by a removed trailing link.
  while (out.length > 0 && isBlankText(out[out.length - 1])) out.pop()
  const last = out[out.length - 1]
  if (last && last.type === 'text' && typeof last.text === 'string') {
    out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, ''), raw: last.raw.replace(/\s+$/, '') } as Token
  }
  return out
}

function liftLinksFromBlocks(tokens: Token[], links: CalloutLink[]): Token[] {
  const out: Token[] = []
  for (const t of tokens) {
    if (t.type === 'paragraph' || (t.type === 'text' && Array.isArray(t.tokens))) {
      const inline = liftLinks((t as Tokens.Paragraph).tokens ?? [], links)
      if (inline.length === 0) continue // the paragraph was only a link
      out.push({ ...t, tokens: inline } as Token)
      continue
    }
    if (t.type === 'list') {
      const list = t as Tokens.List
      out.push({
        ...list,
        items: list.items.map(item => ({ ...item, tokens: liftLinksFromBlocks(item.tokens, links) })),
      } as Token)
      continue
    }
    out.push(t)
  }
  return out
}

/* ------------------------------------------------------------------- main */

const CALLOUT_OPEN = /^:::(tip|note)\b[ \t]*(.*?)[ \t]*$/i
const CALLOUT_CLOSE = /^:::[ \t]*$/

type Segment =
  | { type: 'md'; text: string }
  | { type: 'callout'; kind: 'tip' | 'note'; title: string; text: string }

function splitSegments(markdown: string): Segment[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const segments: Segment[] = []
  let md: string[] = []
  let callout: { kind: 'tip' | 'note'; title: string; lines: string[] } | null = null

  const flushMd = () => {
    if (md.join('').trim() !== '') segments.push({ type: 'md', text: md.join('\n') })
    md = []
  }
  const flushCallout = () => {
    if (!callout) return
    segments.push({ type: 'callout', kind: callout.kind, title: callout.title, text: callout.lines.join('\n') })
    callout = null
  }

  for (const line of lines) {
    if (!callout) {
      const open = line.match(CALLOUT_OPEN)
      if (open) {
        flushMd()
        callout = { kind: open[1].toLowerCase() as 'tip' | 'note', title: open[2], lines: [] }
      } else {
        md.push(line)
      }
    } else if (CALLOUT_CLOSE.test(line)) {
      flushCallout()
    } else {
      callout.lines.push(line)
    }
  }
  flushCallout() // an unterminated block still renders
  flushMd()
  return segments
}

export function renderPostBody(markdown: string): RenderedBody {
  const marked = createMarked()
  const usedIds = new Map<string, number>()
  const headings: TocHeading[] = []

  const uniqueId = (text: string) => {
    const base = slugify(text)
    const n = (usedIds.get(base) ?? 0) + 1
    usedIds.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }

  const blocks: BodyBlock[] = []
  for (const seg of splitSegments(markdown)) {
    if (seg.type === 'md') {
      const tokens = marked.lexer(seg.text)
      for (const t of tokens) {
        if (t.type === 'heading') {
          const h = t as IdHeading
          const text = plainText(h.tokens).trim() || h.text
          h.blogId = uniqueId(text)
          if (h.depth === 2) headings.push({ id: h.blogId, text })
        }
      }
      blocks.push({ type: 'html', html: marked.parser(tokens) })
    } else {
      const tokens = marked.lexer(seg.text)
      const links: CalloutLink[] = []
      const lifted = seg.kind === 'tip' ? liftLinksFromBlocks(tokens, links) : tokens
      blocks.push({
        type: 'callout',
        kind: seg.kind,
        title: seg.title || (seg.kind === 'tip' ? 'Tip' : 'Note'),
        html: marked.parser(lifted),
        links,
      })
    }
  }

  return { blocks, headings }
}
