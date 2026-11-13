import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL, formatReleaseDate, getReleasedPost, getReleasedPosts } from '@/lib/blog'
import { renderPostBody } from '@/lib/blog-markdown'
import BlogCallout from '@/components/blog/BlogCallout'
import BlogToc from '@/components/blog/BlogToc'

// The release date is compared with today's Fort Wayne date every time this
// page is rendered, and the page is rendered again at least once an hour, so a
// post appears on its date without a deploy. A slug that is not released
// yet is a 404.
export const revalidate = 3600

interface PageProps {
  params: { slug: string }
}

// Pre-render the posts that are already released. Any other slug is rendered
// on request, which is how a post released later shows up on its day.
export async function generateStaticParams() {
  const posts = await getReleasedPosts()
  return posts.map(post => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getReleasedPost(params.slug)
  if (!post) return {}
  const url = `${SITE_URL}/blog/${post.slug}/`
  const image = post.cover_image ? `${SITE_URL}/blog/${post.cover_image}` : undefined
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: 'article',
      publishedTime: post.release_on,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const post = await getReleasedPost(params.slug)
  if (!post) notFound()

  const { blocks, headings } = renderPostBody(post.body)
  const url = `${SITE_URL}/blog/${post.slug}/`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.release_on,
    dateModified: post.release_on,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    author: { '@type': 'Organization', name: 'MC Racing Sim Fort Wayne', url: SITE_URL },
    publisher: {
      '@type': 'Organization',
      name: 'MC Racing Sim Fort Wayne',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/mclogoSHADOW.png` },
    },
    image: post.cover_image ? `${SITE_URL}/blog/${post.cover_image}` : `${SITE_URL}/assets/WideTwoRacingBays.webp`,
    ...(post.sources.length > 0
      ? { citation: post.sources.map(s => ({ '@type': 'CreativeWork', name: s.title, url: s.url })) }
      : {}),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article id="blog-article" className="min-h-screen bg-asphalt">
        <header className="relative pt-28 md:pt-36 pb-8 md:pb-10 px-6">
          <div className="absolute inset-0 grid-bg opacity-30" aria-hidden="true" />
          <div className="relative max-w-3xl mx-auto">
            <nav aria-label="Breadcrumb" className="telemetry-text text-xs text-pit-gray mb-6">
              <Link href="/" className="hover:text-apex-red transition-colors">
                Home
              </Link>
              <span className="mx-2 text-apex-red">/</span>
              <Link href="/blog" className="hover:text-apex-red transition-colors">
                Blog
              </Link>
            </nav>

            <h1 className="racing-headline text-[1.75rem] leading-tight sm:text-4xl md:text-5xl text-grid-white mb-5">
              {post.title}
            </h1>

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 telemetry-text text-sm text-pit-gray">
              <time dateTime={post.release_on} className="text-grid-white">
                {formatReleaseDate(post.release_on)}
              </time>
              <span className="text-apex-red" aria-hidden="true">
                |
              </span>
              <span>{post.reading_minutes} min read</span>
            </p>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-6 pb-16">
          {post.cover_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/blog/${post.cover_image}`}
              alt=""
              className="w-full h-auto mb-8 border border-white/10"
              decoding="async"
            />
          )}

          <div id="blog-body" className="blog-content">
            {blocks.map((block, i) =>
              block.type === 'html' ? (
                <div key={i} dangerouslySetInnerHTML={{ __html: block.html }} />
              ) : (
                <BlogCallout key={i} kind={block.kind} title={block.title} html={block.html} links={block.links} />
              ),
            )}
          </div>

          {post.sources.length > 0 && (
            <section aria-labelledby="blog-sources" className="mt-12 pt-8 border-t border-white/10">
              <h2 id="blog-sources" className="racing-headline text-xl text-grid-white mb-4">
                Sources
              </h2>
              <ul className="space-y-3">
                {post.sources.map(source => (
                  <li key={source.url} className="telemetry-text text-sm leading-relaxed">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-telemetry-cyan underline underline-offset-2 hover:text-telemetry-cyan-glow transition-colors break-words"
                    >
                      {source.title}
                    </a>
                    {source.author && <span className="block text-xs text-pit-gray">{source.author}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-12 bg-gradient-to-r from-apex-red/10 to-telemetry-cyan/10 border border-white/10 p-6 md:p-10 text-center">
            <h2 className="racing-headline text-2xl md:text-3xl text-grid-white mb-3">Ready to Race?</h2>
            <p className="telemetry-text text-sm text-pit-gray mb-6 max-w-md mx-auto">
              Book a session at MC Racing Sim in Fort Wayne and feel it for yourself.
            </p>
            <Link href="/book" className="btn-primary inline-block">
              Book a Session
            </Link>
          </section>

          <p className="mt-8 telemetry-text text-sm">
            <Link href="/blog" className="text-pit-gray hover:text-apex-red transition-colors">
              <span className="text-apex-red">&larr;</span> All articles
            </Link>
          </p>
        </div>
      </article>

      <BlogToc headings={headings} />
    </>
  )
}
