import { REVIEWS } from '@/content/reviews'

/**
 * Infinite horizontal scroll of five-star Google reviews for the hero.
 *
 * The list is rendered twice inside one flex track; the CSS animation shifts
 * the track by exactly -50%, which puts the duplicate where the original
 * started, so it loops with no jump and no JavaScript. Hover or keyboard focus
 * pauses it, and reduced-motion users get a plain scrollable row instead.
 */
export default function ReviewsMarquee() {
  // Duplicated for the seamless loop — the copy is decorative, so it's hidden
  // from screen readers to avoid reading every review twice.
  const loop = [
    { items: REVIEWS, ariaHidden: false },
    { items: REVIEWS, ariaHidden: true },
  ]

  return (
    <div
      className="reviews-marquee w-screen relative left-1/2 -translate-x-1/2 overflow-hidden py-1"
      aria-label="Five-star reviews from Google"
    >
      <div className="reviews-track gap-3 sm:gap-4">
        {loop.map((half, halfIndex) => (
          <div
            key={halfIndex}
            className="flex gap-3 sm:gap-4 pr-3 sm:pr-4"
            aria-hidden={half.ariaHidden || undefined}
          >
            {half.items.map((r, i) => (
              <figure
                key={`${halfIndex}-${i}`}
                className="w-[17rem] sm:w-[21rem] shrink-0 border border-white/10 bg-asphalt-dark/70 backdrop-blur-sm px-4 py-3 text-left"
              >
                <span className="text-xs tracking-[0.2em] text-apex-red" aria-hidden="true">
                  ★★★★★
                </span>
                <blockquote className="telemetry-text text-xs sm:text-sm text-grid-white/90 mt-1.5 leading-snug line-clamp-3">
                  {r.quote}
                </blockquote>
                <figcaption className="telemetry-text text-[0.65rem] sm:text-xs text-pit-gray uppercase tracking-wider mt-2">
                  — {r.name}
                </figcaption>
              </figure>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
