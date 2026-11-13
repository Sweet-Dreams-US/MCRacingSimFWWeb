'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface TocHeading {
  id: string
  text: string
}

interface BlogTocProps {
  headings: TocHeading[]
}

/**
 * Contents for a blog post, built from its ## headings.
 *
 * Wide screens (xl and up): a small panel pinned to the bottom left corner.
 * Everything narrower: a bar fixed to the bottom of the screen with the
 * current section and an arrow that opens the full list. Tapping a section
 * jumps to it and closes the list.
 *
 * Both read the page's #blog-body (progress) and #blog-article (so they hide
 * once the article has ended and never sit on top of the footer). This site has
 * no call bar. If one is ever added, raise the bar's `bottom` offset by its
 * height.
 */
export default function BlogToc({ headings }: BlogTocProps) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)
  const [open, setOpen] = useState(false)
  const frame = useRef(0)

  const update = useCallback(() => {
    frame.current = 0
    const body = document.getElementById('blog-body')
    const article = document.getElementById('blog-article')
    if (!body || !article) return
    const vh = window.innerHeight

    // Current section: the last heading that has reached the upper part of the screen.
    let current = headings[0]?.id ?? ''
    for (const h of headings) {
      const el = document.getElementById(h.id)
      if (!el) continue
      if (el.getBoundingClientRect().top <= vh * 0.4) current = h.id
      else break
    }
    setActiveId(current)

    // Reading progress through the body, measured at a line 60% down the screen.
    const b = body.getBoundingClientRect()
    const p = (vh * 0.6 - b.top) / b.height
    setProgress(Math.min(1, Math.max(0, p)))

    // Hide once the end of the article is above the bottom of the screen.
    setVisible(article.getBoundingClientRect().bottom > vh)
  }, [headings])

  useEffect(() => {
    const onScroll = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame.current) window.cancelAnimationFrame(frame.current)
    }
  }, [update])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (headings.length === 0) return null

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ block: 'start' })
    setActiveId(id)
    setOpen(false)
  }

  const pct = Math.round(progress * 100)
  const activeIndex = Math.max(0, headings.findIndex(h => h.id === activeId))
  const activeHeading = headings[activeIndex]

  const list = (
    <ol className="space-y-1">
      {headings.map((h, i) => {
        const isActive = h.id === activeId
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={e => jump(e, h.id)}
              aria-current={isActive ? 'location' : undefined}
              className={`telemetry-text text-xs leading-snug flex gap-2 py-2 pl-3 pr-2 border-l-2 transition-colors ${
                isActive
                  ? 'border-apex-red text-apex-red bg-apex-red/5'
                  : 'border-white/10 text-pit-gray hover:text-grid-white hover:border-white/30'
              }`}
            >
              <span className="text-telemetry-cyan shrink-0">{String(i + 1).padStart(2, '0')}</span>
              <span>{h.text}</span>
            </a>
          </li>
        )
      })}
    </ol>
  )

  return (
    <>
      {/* Wide screens: a small panel in the bottom left corner */}
      <nav
        aria-label="Contents"
        className={`hidden xl:block fixed left-6 bottom-6 z-30 w-56 max-h-[calc(100vh-9rem)] overflow-y-auto bg-asphalt-dark/95 backdrop-blur-md border border-white/10 border-t-2 border-t-apex-red transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-4 pt-3 pb-3">
          <div className="flex items-center justify-between telemetry-text text-xs uppercase tracking-widest mb-2">
            <span className="text-grid-white">Contents</span>
            <span className="text-telemetry-cyan" aria-label={`${pct} percent read`}>
              {pct}%
            </span>
          </div>
          <div className="h-1 bg-white/10 mb-3" role="presentation">
            <div className="h-full bg-apex-red transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
          {list}
        </div>
      </nav>

      {/* Narrower screens: a bar fixed to the bottom with the current section */}
      {open && (
        <button
          type="button"
          aria-label="Close contents"
          onClick={() => setOpen(false)}
          className="xl:hidden fixed inset-0 z-[59] bg-black/60 cursor-default"
        />
      )}
      <div
        // While the list is open it sits above the navigation and the
        // scroll to top button, like a sheet.
        className={`xl:hidden fixed inset-x-0 bottom-0 ${open ? 'z-[60]' : 'z-40'} bg-asphalt-dark transition-[opacity,visibility] duration-300 ${
          visible ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <nav
          id="blog-toc-sheet"
          aria-label="Contents"
          hidden={!open}
          className="max-h-[55vh] overflow-y-auto bg-asphalt-dark border-t border-white/10 px-4 py-3"
        >
          {list}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls="blog-toc-sheet"
          className="relative w-full flex items-center gap-3 px-4 py-3 bg-asphalt-dark border-t border-white/10 text-left"
        >
          <span
            className="absolute left-0 top-0 h-[3px] bg-apex-red transition-[width] duration-150"
            style={{ width: `${pct}%` }}
            aria-hidden="true"
          />
          <span className="telemetry-text text-xs text-telemetry-cyan shrink-0">
            {String(activeIndex + 1).padStart(2, '0')}/{String(headings.length).padStart(2, '0')}
          </span>
          <span className="telemetry-text text-sm text-grid-white truncate flex-1 min-w-0">
            {activeHeading?.text}
          </span>
          <svg
            className={`w-5 h-5 text-grid-white shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </>
  )
}
