import { describe, expect, it } from 'vitest'
import {
  formatReleaseDate,
  isReleased,
  parseFrontMatter,
  parsePost,
  sortNewestFirst,
  todayInFortWayne,
} from '../blog'
import { renderPostBody } from '../blog-markdown'

// These cover the blog's release gate and body rendering with inline strings.
// No post files are read, and none are ever created for a test.

describe('release gate', () => {
  it('uses the Fort Wayne calendar date, not UTC', () => {
    // 03:30 UTC on Nov 2 is still the evening of Nov 1 in Fort Wayne (EST).
    expect(todayInFortWayne(new Date('2026-11-02T03:30:00Z'))).toBe('2026-11-01')
    // 05:30 UTC on Nov 2 is 00:30 Nov 2 in Fort Wayne.
    expect(todayInFortWayne(new Date('2026-11-02T05:30:00Z'))).toBe('2026-11-02')
  })

  it('follows daylight saving time', () => {
    // 03:30 UTC on Jul 2 is 23:30 Jul 1 in Fort Wayne (EDT).
    expect(todayInFortWayne(new Date('2027-07-02T03:30:00Z'))).toBe('2027-07-01')
    expect(todayInFortWayne(new Date('2027-07-02T04:30:00Z'))).toBe('2027-07-02')
  })

  it('releases on and after release_on, never before, never without a date', () => {
    expect(isReleased({ release_on: '2026-11-02' }, '2026-11-01')).toBe(false)
    expect(isReleased({ release_on: '2026-11-02' }, '2026-11-02')).toBe(true)
    expect(isReleased({ release_on: '2026-11-02' }, '2026-12-01')).toBe(true)
    expect(isReleased({ release_on: '' }, '2026-12-01')).toBe(false)
  })

  it('formats a release date without shifting the day', () => {
    expect(formatReleaseDate('2026-11-02')).toBe('November 2, 2026')
    expect(formatReleaseDate('2027-01-02')).toBe('January 2, 2027')
  })

  it('sorts newest first', () => {
    const sorted = sortNewestFirst([
      { release_on: '2026-11-02', seq: 1 },
      { release_on: '2027-01-02', seq: 3 },
      { release_on: '2026-12-02', seq: 2 },
    ])
    expect(sorted.map(p => p.seq)).toEqual([3, 2, 1])
  })
})

describe('post files', () => {
  const file = [
    '---',
    'post_id: abc-123',
    'seq: 2',
    'title: "A title: with a colon"',
    'slug: how-a-thing-works',
    'release_on: 2026-12-02',
    'description: A short description.',
    'reading_minutes: 5',
    'topic_id: topic-9',
    'sources:',
    '  - title: First source',
    '    author: Some Author',
    '    url: https://example.com/one',
    '  - title: Second source',
    '    url: https://example.com/two',
    '---',
    '',
    'Opening paragraph.',
    '',
    '## First heading',
    '',
    'Body.',
  ].join('\r\n')

  it('reads front matter, quoted values, sources and the body', () => {
    const post = parsePost('2026-12-02-how-a-thing-works.md', file)
    expect(post).not.toBeNull()
    expect(post).toMatchObject({
      post_id: 'abc-123',
      seq: 2,
      title: 'A title: with a colon',
      slug: 'how-a-thing-works',
      release_on: '2026-12-02',
      description: 'A short description.',
      reading_minutes: 5,
      topic_id: 'topic-9',
    })
    expect(post?.sources).toEqual([
      { title: 'First source', author: 'Some Author', url: 'https://example.com/one' },
      { title: 'Second source', author: undefined, url: 'https://example.com/two' },
    ])
    expect(post?.body.startsWith('Opening paragraph.')).toBe(true)
  })

  it('treats an empty release_on as no date', () => {
    const post = parsePost('x.md', '---\npost_id: a\ntitle: T\nslug: t\nrelease_on:\n---\nBody')
    expect(post?.release_on).toBe('')
  })

  it('rejects a file without front matter or with a bad slug', () => {
    expect(parsePost('x.md', 'Just text')).toBeNull()
    expect(parsePost('x.md', '---\npost_id: a\ntitle: T\nslug: ../etc\n---\nBody')).toBeNull()
  })

  it('parses an empty sources list', () => {
    expect(parseFrontMatter('sources: []').sources).toEqual([])
  })
})

describe('post body', () => {
  const md = [
    'Opening paragraph with <b>raw html</b>.',
    '',
    '## First section',
    '',
    'Text with a [plain link](/pricing/).',
    '',
    ':::tip Get on track',
    'Short practical point. [Book a session](/book/)',
    ':::',
    '',
    '## Second section',
    '',
    ':::note Worth knowing',
    'A researched fact with [a source link](https://example.com/x).',
    ':::',
    '',
    '## First section',
    '',
    '[bad](javascript:alert(1))',
  ].join('\n')

  const { blocks, headings } = renderPostBody(md)

  it('builds the contents from the ## headings with unique ids', () => {
    expect(headings).toEqual([
      { id: 'first-section', text: 'First section' },
      { id: 'second-section', text: 'Second section' },
      { id: 'first-section-2', text: 'First section' },
    ])
    const html = blocks.filter(b => b.type === 'html').map(b => (b as { html: string }).html).join('')
    expect(html).toContain('<h2 id="first-section">')
    expect(html).toContain('<h2 id="first-section-2">')
  })

  it('escapes raw html and drops unsafe links', () => {
    const html = blocks.filter(b => b.type === 'html').map(b => (b as { html: string }).html).join('')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('javascript:')
  })

  it('renders a tip link as a button, not an inline link', () => {
    const tip = blocks.find(b => b.type === 'callout' && b.kind === 'tip')
    expect(tip).toBeDefined()
    if (tip?.type !== 'callout') throw new Error('expected a callout')
    expect(tip.title).toBe('Get on track')
    expect(tip.links).toEqual([{ text: 'Book a session', href: '/book/' }])
    expect(tip.html).not.toContain('<a ')
    expect(tip.html).toContain('Short practical point.')
    expect(tip.html).not.toContain('Book a session')
  })

  it('keeps links inside a note inline', () => {
    const note = blocks.find(b => b.type === 'callout' && b.kind === 'note')
    if (note?.type !== 'callout') throw new Error('expected a callout')
    expect(note.links).toEqual([])
    expect(note.html).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">')
  })

  it('keeps the words of a link that sits inside a sentence in a tip', () => {
    const { blocks: b } = renderPostBody(':::tip T\nPlan a [birthday party](/pit-lane/) soon.\n:::')
    const tip = b[0]
    if (tip.type !== 'callout') throw new Error('expected a callout')
    expect(tip.links).toEqual([{ text: 'birthday party', href: '/pit-lane/' }])
    expect(tip.html).toContain('Plan a birthday party soon.')
    expect(tip.html).not.toContain('<a ')
  })
})
