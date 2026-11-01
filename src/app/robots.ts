import type { MetadataRoute } from 'next'
import { appUrl, indexingAllowed } from '@/server/app-url'

// The demo stays crawlable (so the per-page noindex is seen) but is kept out of
// search results by default — it is a portfolio piece, not a real shop.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/cart', '/checkout', '/orders', '/wishlist'],
      },
    ],
    sitemap: indexingAllowed() ? appUrl('/sitemap.xml') : undefined,
  }
}
