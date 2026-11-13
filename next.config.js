/** @type {import('next').NextConfig} */

// The 28 posts that used to be written into the site code. They were taken
// off the blog (their text is saved in the client's blog/extra folder) and
// their old addresses now permanently redirect to /blog. Blog posts come only
// from the markdown files in content/blog.
const removedBlogSlugs = [
  'racing-line-explained',
  'traction-circle-explained',
  'direct-drive-wheels-explained',
  'iracing-beginners-guide',
  'sim-racing-translates-to-real-motorsport',
  '1-10-scale-rc-cars-explained',
  'newtons-laws-rc-cars',
  'family-entertainment-fort-wayne-guide',
  'how-turbocharger-works',
  'trail-braking-masterclass',
  'load-cell-pedals-upgrade',
  'karting-to-f1-pipeline',
  'ayrton-senna-legacy',
  'birthday-party-hosting-guide',
  'electric-vs-nitro-rc-cars',
  'assetto-corsa-competizione-beginners',
  'g-forces-in-racing',
  'fwd-vs-rwd-vs-awd',
  'fort-wayne-date-night-ideas',
  'building-perfect-sim-racing-pc',
  'sim-racing-vs-karting-cost',
  'rc-suspension-tuning-101',
  'understeer-vs-oversteer',
  'mental-game-sim-racing',
  'google-business-profile-optimization',
  'women-in-motorsport',
  'history-of-nascar',
  'gear-ratios-math-rc-cars',
]

const nextConfig = {
  images: {
    domains: ['images.unsplash.com', 'www.proracingsimulators.co.uk', 'www.diehardrc.com'],
  },
  trailingSlash: true,
  experimental: {
    // Blog posts are read from disk when a page is rendered again (hourly),
    // which is how a post appears on its date without a deploy. Ship the files
    // with every function that reads them.
    outputFileTracingIncludes: {
      '/blog': ['./content/blog/**/*'],
      '/blog/[slug]': ['./content/blog/**/*'],
      '/blog/rss.xml': ['./content/blog/**/*'],
      '/blog/images/[...path]': ['./content/blog/**/*'],
      '/sitemap.xml': ['./content/blog/**/*'],
      '/api/blog/status': ['./content/blog/**/*'],
    },
  },
  async redirects() {
    return removedBlogSlugs.map((slug) => ({
      source: `/blog/${slug}`,
      destination: '/blog/',
      permanent: true,
    }))
  },
}

module.exports = nextConfig
