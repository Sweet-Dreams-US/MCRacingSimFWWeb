import { MetadataRoute } from 'next'
import { getReleasedPosts } from '@/lib/blog'

// Rebuilt at least once an hour so a post released today is listed without a deploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://mcracingfortwayne.com'
  const lastModified = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pit-lane`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/location`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/checkin`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // Released posts only. With none released, /blog is left out as well.
  const posts = await getReleasedPosts()
  const blogPages: MetadataRoute.Sitemap =
    posts.length === 0
      ? []
      : [
          {
            url: `${baseUrl}/blog/`,
            lastModified: new Date(posts[0].release_on),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          },
          ...posts.map(post => ({
            url: `${baseUrl}/blog/${post.slug}/`,
            lastModified: new Date(post.release_on),
            changeFrequency: 'monthly' as const,
            priority: 0.7,
          })),
        ]

  return [...staticPages, ...blogPages]
}
