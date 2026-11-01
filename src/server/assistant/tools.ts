// Database-backed tools for the shopping assistant. Both the AI mode and the
// catalogue mode answer only from what these functions return: live products,
// variant stock, prices, policies and delivery options — never from a list
// written into a prompt.
import { asc, eq, inArray } from 'drizzle-orm'
import { AVAILABILITY_LABELS, sizeLabel, TAG_LABELS, variantAvailability } from '@/lib/catalog'
import {
  availabilityOf,
  colorFamily,
  COLOR_FAMILIES,
  filterCatalog,
  matchesQuery,
  normalizeText,
  type CatalogProduct,
  type ColorFamily,
} from '@/lib/catalog-filter'
import type { Policies, PolicyKey, StoreInfo } from '@/lib/settings'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { loadCatalog } from '@/server/queries/catalog'
import { loadPolicies, loadShippingMethods, loadStoreInfo } from '@/server/queries/settings'

export interface ToolContext {
  db: Database
  catalog: CatalogProduct[]
  policies: Policies
  info: StoreInfo
  shipping: { code: string; name: string; description: string; fee: number; freeThreshold: number | null; eta: string; region: string }[]
  categories: { slug: string; name: string }[]
}

export async function buildToolContext(db: Database): Promise<ToolContext> {
  const [catalog, policies, info, shipping, categories] = await Promise.all([
    loadCatalog(db),
    loadPolicies(db),
    loadStoreInfo(db),
    loadShippingMethods(db),
    db.select({ slug: t.categories.slug, name: t.categories.name }).from(t.categories).where(eq(t.categories.isActive, true)).orderBy(asc(t.categories.sortOrder)),
  ])
  return { db, catalog, policies, info, shipping, categories }
}

/** Compact, factual product summary handed to the model and used for chat cards. */
export interface ProductFacts {
  name: string
  slug: string
  url: string
  category: string
  price: number
  maxPrice: number
  colors: string[]
  sizes: string[]
  availability: string
  inStock: Record<string, string[]>
  material: string
  fit: string | null
  image: string | null
  imageAlt: string
}

export function productFacts(p: CatalogProduct): ProductFacts {
  const inStock: Record<string, string[]> = {}
  for (const c of p.colors) {
    const sizes = p.variants.filter((v) => v.colorId === c.id && v.isActive && v.stock > 0).map((v) => sizeLabel(v.size))
    inStock[c.name] = sizes
  }
  return {
    name: p.name,
    slug: p.slug,
    url: `/products/${p.slug}`,
    category: p.categoryName,
    price: p.minPrice,
    maxPrice: p.maxPrice,
    colors: p.colors.map((c) => c.name),
    sizes: p.sizes.map(sizeLabel),
    availability: AVAILABILITY_LABELS[availabilityOf(p)],
    inStock,
    material: p.material,
    fit: p.fit,
    image: p.images[0]?.url ?? null,
    imageAlt: p.images[0]?.alt ?? p.name,
  }
}

/** Finds a product by slug or (part of) its name. */
export function resolveProduct(tc: ToolContext, ref: string): CatalogProduct[] {
  const value = ref.trim()
  if (!value) return []
  const bySlug = tc.catalog.find((p) => p.slug === value || value.endsWith(`/products/${p.slug}`))
  if (bySlug) return [bySlug]
  const norm = normalizeText(value)
  const byName = tc.catalog.filter((p) => normalizeText(p.name) === norm)
  if (byName.length) return byName
  const partial = tc.catalog.filter((p) => normalizeText(p.name).includes(norm))
  if (partial.length) return partial
  return tc.catalog.filter((p) => matchesQuery(p, value, TAG_LABELS))
}

function familyOf(value: string | undefined | null): ColorFamily | null {
  if (!value) return null
  const v = normalizeText(value)
  for (const [family, def] of Object.entries(COLOR_FAMILIES) as [ColorFamily, (typeof COLOR_FAMILIES)[ColorFamily]][]) {
    if (family === v || def.words.some((w) => v.includes(w))) return family
  }
  return null
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export interface SearchArgs {
  query?: string | null
  category?: string | null
  color?: string | null
  size?: string | null
  max_price?: number | null
  min_price?: number | null
  in_stock_only?: boolean | null
  audience?: 'women' | 'men' | null
  tag?: string | null
  sort?: 'price_asc' | 'price_desc' | 'featured' | 'newest' | null
  limit?: number | null
}

export function searchProducts(tc: ToolContext, args: SearchArgs): CatalogProduct[] {
  const family = familyOf(args.color)
  const category = args.category ? tc.categories.find((c) => c.slug === args.category || normalizeText(c.name) === normalizeText(args.category!))?.slug ?? null : null
  let list = filterCatalog(
    tc.catalog,
    {
      q: args.query ?? null,
      category,
      colors: family ? [family] : undefined,
      sizes: args.size ? [args.size.toUpperCase()] : undefined,
      maxPrice: args.max_price ?? null,
      minPrice: args.min_price ?? null,
      inStockOnly: !!args.in_stock_only,
      audience: args.audience ?? null,
      sort: args.sort === 'price_asc' ? 'price-asc' : args.sort === 'price_desc' ? 'price-desc' : args.sort === 'newest' ? 'newest' : 'featured',
    },
    TAG_LABELS,
  )
  if (args.tag) list = list.filter((p) => p.tags.includes(args.tag!))
  return list.slice(0, Math.min(Math.max(args.limit ?? 6, 1), 12))
}

export async function productDetail(tc: ToolContext, ref: string) {
  const matches = resolveProduct(tc, ref)
  if (matches.length !== 1) return { found: matches.length, candidates: matches.slice(0, 6).map((p) => ({ name: p.name, slug: p.slug })) }
  const p = matches[0]
  const [row] = await tc.db
    .select({ description: t.products.description, care: t.products.care })
    .from(t.products)
    .where(eq(t.products.id, p.id))
    .limit(1)
  return { found: 1, product: { ...productFacts(p), description: row?.description ?? '', care: row?.care ?? '', tags: p.tags.map((tag) => TAG_LABELS[tag] ?? tag) } }
}

export interface StockLine {
  color: string
  size: string
  stock: number
  status: string
  price: number
}

export function checkStock(tc: ToolContext, args: { product: string; color?: string | null; size?: string | null }) {
  const matches = resolveProduct(tc, args.product)
  if (matches.length !== 1) return { found: matches.length, candidates: matches.slice(0, 6).map((p) => ({ name: p.name, slug: p.slug })) }
  const p = matches[0]
  const family = familyOf(args.color)
  const wantedSize = args.size ? args.size.toUpperCase().replace('2XL', 'XXL') : null
  const lines: StockLine[] = []
  for (const v of p.variants) {
    const color = p.colors.find((c) => c.id === v.colorId)
    if (!color) continue
    if (family && colorFamily(color.hex) !== family && normalizeText(color.name) !== normalizeText(args.color ?? '')) continue
    if (wantedSize && v.size !== wantedSize) continue
    lines.push({
      color: color.name,
      size: sizeLabel(v.size),
      stock: v.isActive ? v.stock : 0,
      status: AVAILABILITY_LABELS[variantAvailability(v)],
      price: v.price,
    })
  }
  return { found: 1, product: { name: p.name, slug: p.slug, url: `/products/${p.slug}` }, variants: lines, sizesOffered: p.sizes.map(sizeLabel), colorsOffered: p.colors.map((c) => c.name) }
}

const POLICY_KEYS: PolicyKey[] = ['delivery', 'returns', 'exchange', 'ordering', 'payment', 'privacy']

export function getPolicy(tc: ToolContext, topic: string) {
  const key = (POLICY_KEYS.includes(topic as PolicyKey) ? topic : topic === 'change_order' ? 'ordering' : null) as PolicyKey | null
  const shipping = tc.shipping.map((s) => ({ name: s.name, fee: s.fee, freeFrom: s.freeThreshold, eta: s.eta, description: s.description }))
  if (topic === 'contact') return { topic, contactEmail: tc.info.contactEmail, hours: tc.info.contactHours, note: 'Демо дэлгүүр: бодит утас, хаяг байхгүй.' }
  if (!key) return { topic, error: 'unknown topic' }
  const policy = tc.policies[key]
  return { topic: key, title: policy.title, text: policy.body, ...(key === 'delivery' ? { shippingMethods: shipping } : {}) }
}

export function listCategories(tc: ToolContext) {
  return tc.categories.map((c) => {
    const products = tc.catalog.filter((p) => p.categorySlug === c.slug)
    const prices = products.map((p) => p.minPrice)
    return {
      slug: c.slug,
      name: c.name,
      productCount: products.length,
      priceFrom: prices.length ? Math.min(...prices) : null,
      priceTo: prices.length ? Math.max(...products.map((p) => p.maxPrice)) : null,
    }
  })
}

export async function compareProducts(tc: ToolContext, refs: string[]) {
  const out: NonNullable<Extract<Awaited<ReturnType<typeof productDetail>>, { product: unknown }>['product']>[] = []
  for (const ref of refs.slice(0, 4)) {
    const detail = await productDetail(tc, ref)
    if ('product' in detail && detail.product) out.push(detail.product)
  }
  return { products: out }
}

/** Card data for slugs, preserving order. */
export function cardsFor(tc: ToolContext, slugs: string[]): ProductFacts[] {
  const unique = [...new Set(slugs)]
  return unique
    .map((s) => tc.catalog.find((p) => p.slug === s))
    .filter((p): p is CatalogProduct => !!p)
    .slice(0, 4)
    .map(productFacts)
}

/** Every amount a truthful reply may mention (prices, fees, thresholds). */
export function allowedAmounts(tc: ToolContext): Set<number> {
  const set = new Set<number>()
  for (const p of tc.catalog) {
    set.add(p.minPrice)
    set.add(p.maxPrice)
    set.add(p.basePrice)
    for (const v of p.variants) set.add(v.price)
  }
  for (const s of tc.shipping) {
    set.add(s.fee)
    if (s.freeThreshold) set.add(s.freeThreshold)
  }
  return set
}

export async function productIdsForSlugs(db: Database, slugs: string[]) {
  if (slugs.length === 0) return []
  return db.select({ id: t.products.id, slug: t.products.slug }).from(t.products).where(inArray(t.products.slug, slugs))
}
