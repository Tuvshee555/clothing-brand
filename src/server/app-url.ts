// Absolute URLs for canonical links, sitemap, Open Graph and payment callbacks.

function baseUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3200')
  return raw.replace(/\/+$/, '')
}

/** appUrl() -> "https://host", appUrl('/shop') -> "https://host/shop". */
export function appUrl(path = ''): string {
  if (!path || path === '/') return baseUrl()
  return `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`
}

/** Search engines may index the demo only when STORE_INDEXING=index (default: noindex). */
export function indexingAllowed(): boolean {
  return process.env.STORE_INDEXING === 'index'
}
