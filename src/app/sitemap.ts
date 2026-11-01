import type { MetadataRoute } from 'next'
import { POLICY_SLUGS } from '@/lib/settings'
import { appUrl } from '@/server/app-url'
import { getCatalog, getNavigation } from '@/server/queries/catalog'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, nav] = await Promise.all([getCatalog(), getNavigation()])
  return [
    { url: appUrl('/'), changeFrequency: 'weekly', priority: 1 },
    { url: appUrl('/shop'), changeFrequency: 'daily', priority: 0.9 },
    ...nav.categories.map((c) => ({ url: appUrl(`/shop/${c.slug}`), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...nav.collections.map((c) => ({ url: appUrl(`/collections/${c.slug}`), changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...catalog.map((p) => ({ url: appUrl(`/products/${p.slug}`), changeFrequency: 'weekly' as const, priority: p.isFeatured ? 0.8 : 0.6 })),
    ...Object.values(POLICY_SLUGS).map((s) => ({ url: appUrl(`/help/${s}`), changeFrequency: 'monthly' as const, priority: 0.3 })),
    { url: appUrl('/size-guide'), changeFrequency: 'monthly', priority: 0.3 },
    { url: appUrl('/about'), changeFrequency: 'monthly', priority: 0.4 },
  ]
}
