import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL, formatReleaseDate, getReleasedPosts } from '@/lib/blog'

// Rendered again at least once an hour so a post released today shows up
// without a deploy.
export const revalidate = 3600

const description = 'Articles from MC Racing Sim Fort Wayne about sim racing and how it works.'

export const metadata: Metadata = {
  title: 'The Pit Wall Blog',
  description,
  alternates: {
    canonical: `${SITE_URL}/blog/`,
    types: { 'application/rss+xml': `${SITE_URL}/blog/rss.xml` },
  },
  openGraph: {
    title: 'The Pit Wall Blog | MC Racing Sim Fort Wayne',
    description,
    url: `${SITE_URL}/blog/`,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'The Pit Wall Blog | MC Racing Sim Fort Wayne',
    description,
  },
}

export default async function BlogIndexPage() {
  const posts = await getReleasedPosts()

  return (
    <div className="min-h-screen bg-asphalt">
      <section className="relative pt-28 md:pt-36 pb-10 md:pb-14 px-6">
        <div className="absolute inset-0 grid-bg opacity-30" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto">
          <nav aria-label="Breadcrumb" className="telemetry-text text-xs text-pit-gray mb-6">
            <Link href="/" className="hover:text-apex-red transition-colors">
              Home
            </Link>
            <span className="mx-2 text-apex-red">/</span>
            <span className="text-telemetry-cyan">Blog</span>
          </nav>
          <h1 className="racing-headline text-5xl md:text-6xl lg:text-7xl text-grid-white mb-4">The Pit Wall</h1>
          <p className="telemetry-text text-base md:text-lg text-pit-gray max-w-2xl">{description}</p>
        </div>
      </section>

      <section className="px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          {posts.length === 0 ? (
            <div className="card-dark p-8 text-center">
              <p className="racing-headline text-xl text-grid-white mb-2">No articles yet</p>
              <p className="telemetry-text text-sm text-pit-gray">New articles are on the way. Check back soon.</p>
            </div>
          ) : (
            <ul className="space-y-6">
              {posts.map(post => (
                <li key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="card-dark group block p-6 md:p-8">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 telemetry-text text-xs text-pit-gray mb-3">
                      <time dateTime={post.release_on} className="text-telemetry-cyan">
                        {formatReleaseDate(post.release_on)}
                      </time>
                      <span className="text-apex-red" aria-hidden="true">
                        |
                      </span>
                      <span>{post.reading_minutes} min read</span>
                    </p>
                    <h2 className="racing-headline text-xl md:text-2xl text-grid-white group-hover:text-apex-red transition-colors mb-3">
                      {post.title}
                    </h2>
                    <p className="telemetry-text text-sm text-pit-gray leading-relaxed mb-4">{post.description}</p>
                    <span className="telemetry-text text-xs uppercase tracking-widest text-apex-red">
                      Read article <span aria-hidden="true">&rarr;</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
