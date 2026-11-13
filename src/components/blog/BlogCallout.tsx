import Link from 'next/link'
import type { CalloutLink } from '@/lib/blog-markdown'

interface BlogCalloutProps {
  kind: 'tip' | 'note'
  title: string
  html: string
  links: CalloutLink[]
}

/**
 * A :::tip or :::note block from a post. A tip's links are shown as buttons
 * under its text, never as inline links. The site has no contact popup, so a
 * link to /contact goes to the contact page like any other link.
 */
export default function BlogCallout({ kind, title, html, links }: BlogCalloutProps) {
  const isTip = kind === 'tip'
  return (
    <aside className={`blog-callout ${isTip ? 'blog-callout-tip' : 'blog-callout-note'}`}>
      <p className="blog-callout-kicker">{isTip ? 'Pit tip' : 'Good to know'}</p>
      <p className="blog-callout-title">{title}</p>
      {html.trim() !== '' && <div className="blog-callout-text" dangerouslySetInnerHTML={{ __html: html }} />}
      {isTip && links.length > 0 && (
        <div className="blog-callout-actions">
          {links.map(link =>
            link.href.startsWith('/') ? (
              <Link key={link.href + link.text} href={link.href} className="btn-primary blog-callout-button">
                {link.text}
              </Link>
            ) : (
              <a
                key={link.href + link.text}
                href={link.href}
                {...(/^https?:\/\//i.test(link.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="btn-primary blog-callout-button"
              >
                {link.text}
              </a>
            ),
          )}
        </div>
      )}
    </aside>
  )
}
