import type { MetadataRoute } from 'next'

export const revalidate = 3600

const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || 'https://dreamifly.com').replace(/\/+$/, '')

const publicRoutes: Array<{
  path: string
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>
  priority: number
}> = [
  {
    path: '/',
    changeFrequency: 'daily',
    priority: 1,
  },
  {
    path: '/create',
    changeFrequency: 'daily',
    priority: 0.9,
  },
  {
    path: '/pricing',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/workflows',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  {
    path: '/community',
    changeFrequency: 'daily',
    priority: 0.85,
  },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return publicRoutes.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }))
}
