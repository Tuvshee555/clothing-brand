// Catalogue URL parameters <-> filters. Unknown or malformed values are ignored,
// so a hand-edited URL can never break the listing.
import { PRICE_BUCKETS, SORT_OPTIONS, type PriceBucketKey, type SortKey } from './catalog'
import { COLOR_FAMILIES, type CatalogFilters, type ColorFamily } from './catalog-filter'

export type RawParams = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const list = (v: string | string[] | undefined) =>
  one(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

export function parseCatalogParams(params: RawParams): CatalogFilters & { sort: SortKey } {
  const sort = one(params.sort) as SortKey
  const price = one(params.price) as PriceBucketKey
  return {
    sizes: list(params.size)
      .map((s) => s.toUpperCase())
      .filter((s) => /^[A-Z0-9/ ]{1,10}$/.test(s))
      .slice(0, 10),
    colors: list(params.color).filter((c): c is ColorFamily => c in COLOR_FAMILIES),
    price: PRICE_BUCKETS.some((b) => b.key === price) ? price : null,
    inStockOnly: one(params.stock) === '1',
    q: one(params.q).trim().slice(0, 80) || null,
    sort: sort in SORT_OPTIONS ? sort : 'featured',
  }
}

/** Builds a query string from filters (only non-default values). */
export function catalogQuery(f: { sizes?: string[]; colors?: string[]; price?: string | null; inStockOnly?: boolean; q?: string | null; sort?: string }): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.sizes?.length) sp.set('size', f.sizes.join(','))
  if (f.colors?.length) sp.set('color', f.colors.join(','))
  if (f.price) sp.set('price', f.price)
  if (f.inStockOnly) sp.set('stock', '1')
  if (f.sort && f.sort !== 'featured') sp.set('sort', f.sort)
  const s = sp.toString()
  return s ? `?${s}` : ''
}
