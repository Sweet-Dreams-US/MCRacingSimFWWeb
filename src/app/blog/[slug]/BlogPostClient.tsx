'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BlogPost, getCategoryColor } from '@/lib/blog'

interface BlogPostClientProps {
  post: BlogPost
  relatedPosts: BlogPost[]
  prevPost: BlogPost | null
  nextPost: BlogPost | null
}

function useHeadings(content: string) {
  return useMemo(() => {
    const regex = /<h2[^>]*>(.*?)<\/h2>/gi
    const matches: { id: string; text: string }[] = []
    let match
    while ((match = regex.exec(content)) !== null) {
      const text = match[1].replace(/<[^>]*>/g, '')
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      matches.push({ id, text })
    }
    return matches
  }, [content])
}

function useActiveHeading(headings: { id: string; text: string }[]) {
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-80px 0px -80% 0px' }
    )

    headings.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  return activeId
}

function TableOfContents({ content }: { content: string }) {
  const headings = useHeadings(content)
  const activeId = useActiveHeading(headings)

  if (headings.length < 2) return null

  return (
    <nav className="hidden xl:block sticky top-28 w-64 shrink-0 self-start">
      <h4 className="racing-headline text-sm text-grid-white mb-4 pb-2 border-b border-white/10">
        Table of Contents
      </h4>
      <ul className="space-y-2">
        {headings.map(({ id, text }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className={`telemetry-text text-xs block py-1 pl-3 border-l-2 transition-all ${
                activeId === id
                  ? 'border-apex-red text-apex-red'
                  : 'border-white/10 text-pit-gray hover:text-grid-white hover:border-white/30'
              }`}
            >
              {text}
            </a>
          </li>
        ))}
      </ul>

      {/* Sidebar CTA */}
      <div className="mt-8 p-4 bg-apex-red/10 border border-apex-red/30">
        <p className="racing-headline text-sm text-grid-white mb-2">Ready to Race?</p>
        <p className="telemetry-text text-xs text-pit-gray mb-3">Book a session on our pro-grade simulators.</p>
        <Link href="/pricing" className="block text-center bg-apex-red text-white telemetry-text text-xs py-2 px-4 hover:bg-apex-red-glow transition-colors">
          Book Now
        </Link>
      </div>
    </nav>
  )
}

function MobileTOC({ content }: { content: string }) {
  const headings = useHeadings(content)
  const activeId = useActiveHeading(headings)
  const [isOpen, setIsOpen] = useState(false)

  const activeHeading = headings.find(h => h.id === activeId) || headings[0]

  if (headings.length < 2) return null

  return (
    <div className="xl:hidden fixed bottom-0 left-0 right-0" style={{ zIndex: 9999, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Expanded TOC */}
      {isOpen && (
        <div className="bg-asphalt-dark border-t border-apex-red/50 max-h-[50vh] overflow-y-auto">
          <ul className="px-6 py-4 space-y-1">
            {headings.map(({ id, text }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={() => setIsOpen(false)}
                  className={`telemetry-text text-xs block py-2 pl-3 border-l-2 transition-all ${
                    activeId === id
                      ? 'border-apex-red text-apex-red'
                      : 'border-white/10 text-pit-gray'
                  }`}
                >
                  {text}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsed bar showing current section */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-asphalt-dark border-t-2 border-apex-red px-6 py-4 flex items-center justify-between"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2.5 h-2.5 bg-apex-red rounded-full shrink-0 animate-pulse"></span>
          <span className="telemetry-text text-sm text-grid-white truncate">
            {activeHeading?.text || 'Table of Contents'}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-grid-white shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}

function ReadingProgress() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const article = document.getElementById('blog-article')
      if (!article) return
      const rect = article.getBoundingClientRect()
      const total = article.scrollHeight
      const scrolled = Math.max(0, -rect.top)
      setProgress(Math.min(100, (scrolled / (total - window.innerHeight)) * 100))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return <div className="reading-progress" style={{ width: `${progress}%` }} />
}

function addHeadingIds(html: string): string {
  return html.replace(/<h2([^>]*)>(.*?)<\/h2>/gi, (_, attrs, text) => {
    const plainText = text.replace(/<[^>]*>/g, '')
    const id = plainText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return `<h2${attrs} id="${id}">${text}</h2>`
  })
}

export default function BlogPostClient({ post, relatedPosts, prevPost, nextPost }: BlogPostClientProps) {
  const processedContent = useMemo(() => addHeadingIds(post.content), [post.content])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    image: `https://mcracingfortwayne.com${post.featuredImage}`,
    datePublished: post.publishDate,
    dateModified: post.modifiedDate,
    author: {
      '@type': 'Organization',
      name: post.author.name,
    },
    publisher: {
      '@type': 'Organization',
      name: 'MC Racing Sim Fort Wayne',
      logo: {
        '@type': 'ImageObject',
        url: 'https://mcracingfortwayne.com/assets/mclogoSHADOW.png',
      },
    },
    description: post.metaDescription,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://mcracingfortwayne.com/blog/${post.slug}`,
    },
  }

  return (
    <>
      <ReadingProgress />
      <MobileTOC content={post.content} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article id="blog-article" className="min-h-screen bg-asphalt">
        {/* Hero */}
        <header className="relative pt-28 pb-12">
          <div className="absolute inset-0">
            <Image
              src={post.featuredImage}
              alt={post.featuredImageAlt}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-asphalt-dark/70 via-asphalt-dark/85 to-asphalt"></div>
          </div>

          <div className="relative max-w-4xl mx-auto px-6">
            {/* Breadcrumb */}
            <nav className="telemetry-text text-xs text-pit-gray mb-6">
              <Link href="/" className="hover:text-apex-red transition-colors">Home</Link>
              <span className="mx-2 text-apex-red">/</span>
              <Link href="/blog" className="hover:text-apex-red transition-colors">Blog</Link>
              <span className="mx-2 text-apex-red">/</span>
              <span className="text-telemetry-cyan">{post.category}</span>
            </nav>

            {/* Category badge */}
            <span className={`inline-block ${getCategoryColor(post.category)} text-white telemetry-text text-xs px-3 py-1 mb-4`}>
              {post.category}
            </span>

            {/* Title */}
            <h1 className="racing-headline text-4xl md:text-5xl lg:text-6xl text-grid-white mb-6 leading-tight">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 telemetry-text text-sm text-pit-gray">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-apex-red flex items-center justify-center transform -skew-x-6">
                  <span className="text-white text-xs font-bold transform skew-x-6">MC</span>
                </div>
                <div>
                  <span className="text-grid-white">{post.author.name}</span>
                  <span className="block text-xs">{post.author.role}</span>
                </div>
              </div>
              <span className="text-white/20">|</span>
              <time dateTime={post.publishDate}>
                {new Date(post.publishDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <span className="text-white/20">|</span>
              <span>{post.readTime} min read</span>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-4">
              {post.tags.map(tag => (
                <span key={tag} className="telemetry-text text-xs text-telemetry-cyan/60 border border-telemetry-cyan/20 px-2 py-0.5">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Content + TOC */}
        <div className="max-w-7xl mx-auto px-6 py-12 flex gap-12">
          {/* Main content */}
          <div className="flex-1 max-w-4xl">
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: processedContent }}
            />

            {/* References note */}
            <div className="mt-12 pt-8 border-t border-white/10">
              <p className="telemetry-text text-xs text-pit-gray">
                Published by {post.author.name} on{' '}
                {new Date(post.publishDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                . All information reflects the latest data available at the time of writing.
              </p>
            </div>

            {/* Prev / Next */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {prevPost && (
                <Link
                  href={`/blog/${prevPost.slug}`}
                  className="card-dark p-4 group"
                >
                  <span className="telemetry-text text-xs text-pit-gray">Previous</span>
                  <span className="block racing-headline text-sm text-grid-white group-hover:text-apex-red transition-colors mt-1">
                    {prevPost.title}
                  </span>
                </Link>
              )}
              {nextPost && (
                <Link
                  href={`/blog/${nextPost.slug}`}
                  className={`card-dark p-4 group text-right ${!prevPost ? 'md:col-start-2' : ''}`}
                >
                  <span className="telemetry-text text-xs text-pit-gray">Next</span>
                  <span className="block racing-headline text-sm text-grid-white group-hover:text-apex-red transition-colors mt-1">
                    {nextPost.title}
                  </span>
                </Link>
              )}
            </div>
          </div>

          {/* Sidebar TOC */}
          <TableOfContents content={post.content} />
        </div>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="max-w-7xl mx-auto px-6 pb-16">
            <div className="border-t border-white/10 pt-12">
              <h2 className="racing-headline text-2xl text-grid-white mb-8">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map(related => (
                  <Link
                    key={related.slug}
                    href={`/blog/${related.slug}`}
                    className="card-dark group"
                  >
                    <div className="relative aspect-video overflow-hidden">
                      <Image
                        src={related.featuredImage}
                        alt={related.featuredImageAlt}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-asphalt-dark/80 to-transparent"></div>
                    </div>
                    <div className="p-4">
                      <span className="telemetry-text text-xs text-pit-gray">
                        {new Date(related.publishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <h3 className="racing-headline text-sm text-grid-white group-hover:text-apex-red transition-colors mt-1">
                        {related.title}
                      </h3>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Bottom CTA */}
        <section className="max-w-4xl mx-auto px-6 pb-20 xl:pb-20 pb-32">
          <div className="bg-gradient-to-r from-apex-red/10 to-telemetry-cyan/10 border border-white/10 p-8 md:p-12 text-center">
            <h2 className="racing-headline text-3xl text-grid-white mb-4">
              Experience It Yourself
            </h2>
            <p className="telemetry-text text-pit-gray mb-6 max-w-lg mx-auto">
              We here at MC Racing prefer quality over quantity for our simulators. We currently have three, so make sure to book ahead.
            </p>
            <Link href="/pricing" className="btn-primary">
              Book a Session
            </Link>
          </div>
        </section>
      </article>
    </>
  )
}
