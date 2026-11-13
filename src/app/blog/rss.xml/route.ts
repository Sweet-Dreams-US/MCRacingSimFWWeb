import { SITE_URL, getReleasedPosts } from '@/lib/blog'

// Released posts only, rebuilt at least once an hour like the pages.
export const revalidate = 3600

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const posts = await getReleasedPosts()
  const items = posts
    .map(post => {
      const url = `${SITE_URL}/blog/${post.slug}/`
      return [
        '    <item>',
        `      <title>${xml(post.title)}</title>`,
        `      <link>${xml(url)}</link>`,
        `      <guid isPermaLink="true">${xml(url)}</guid>`,
        `      <pubDate>${new Date(`${post.release_on}T12:00:00Z`).toUTCString()}</pubDate>`,
        `      <description>${xml(post.description)}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Pit Wall | MC Racing Sim Fort Wayne</title>
    <link>${SITE_URL}/blog/</link>
    <description>Articles from MC Racing Sim Fort Wayne about sim racing and how it works.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`

  return new Response(body, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
