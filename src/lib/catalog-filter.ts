// Pure catalogue filtering, search and sorting over database-loaded products.
// The product listing and the shopping assistant both use these functions, so a
// filter behaves the same everywhere. No data lives here — only rules.
import {
  compareSizes,
  PRICE_BUCKETS,
  productAvailability,
  type Audience,
  type Availability,
  type PriceBucketKey,
  type SortKey,
} from './catalog'

export interface CatalogVariant {
  id: string
  colorId: string
  colorCode: string
  size: string
  sku: string
  price: number
  stock: number
  lowStockThreshold: number
  isActive: boolean
}

export interface CatalogColor {
  id: string
  code: string
  name: string
  hex: string
}

export interface CatalogImage {
  url: string
  alt: string
  colorId: string | null
}

export interface CatalogProduct {
  id: string
  slug: string
  name: string
  categorySlug: string
  categoryName: string
  audience: Audience
  shortDescription: string
  material: string
  fit: string | null
  basePrice: number
  minPrice: number
  maxPrice: number
  isFeatured: boolean
  isNewArrival: boolean
  tags: string[]
  sortOrder: number
  publishedAt: string | null
  collectionSlugs: string[]
  colors: CatalogColor[]
  sizes: string[]
  images: CatalogImage[]
  variants: CatalogVariant[]
}

// ---------------------------------------------------------------------------
// Colour families (for the filter and for questions like "хар hoodie байна уу?")
// ---------------------------------------------------------------------------

export const COLOR_FAMILIES = {
  black: { label: 'Хар', hex: '#151515', words: ['хар', 'black', 'нүүрсэн'] },
  grey: { label: 'Саарал', hex: '#9a9893', words: ['саарал', 'grey', 'gray', 'нүүрсэн саарал'] },
  white: { label: 'Цагаан', hex: '#f4f2ec', words: ['цагаан', 'white', 'цөцгий', 'ivory', 'cream'] },
  beige: { label: 'Шаргал', hex: '#d3c2a5', words: ['шаргал', 'beige', 'элсэн', 'латте', 'бор шаргал', 'sand', 'camel', 'тэмээн'] },
  brown: { label: 'Хүрэн', hex: '#6b4a33', words: ['хүрэн', 'brown', 'шоколад', 'бор'] },
  blue: { label: 'Цэнхэр', hex: '#3f5f86', words: ['цэнхэр', 'хөх', 'blue', 'navy', 'жинсэн цэнхэр'] },
  green: { label: 'Ногоон', hex: '#5b6343', words: ['ногоон', 'green', 'чидун', 'olive', 'хаки'] },
  red: { label: 'Улаан', hex: '#7a2430', words: ['улаан', 'red', 'бордо', 'burgundy'] },
} as const
export type ColorFamily = keyof typeof COLOR_FAMILIES

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  const n = m ? parseInt(m[1], 16) : 0x808080
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

/** Classifies any colour (including ones admins add later) into a filter family. */
export function colorFamily(hex: string): ColorFamily {
  const { h, s, l } = hexToHsl(hex)
  if (l < 0.17) return 'black'
  if (s < 0.14 || (s < 0.22 && l < 0.3)) return l > 0.86 ? 'white' : 'grey'
  if (l > 0.9) return 'white'
  if (h >= 15 && h < 55) return l > 0.6 ? 'beige' : 'brown'
  if (h >= 55 && h < 170) return 'green'
  if (h >= 170 && h < 265) return 'blue'
  if (h >= 265 && h < 330) return 'red'
  return 'red'
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Words a shopper may type (Mongolian, Latin, transliterated) → words found in our data. */
const SYNONYMS: [string[], string[]][] = [
  [['hoodie', 'худи', 'hudi', 'малгайтай'], ['hoodie', 'малгайтай']],
  [['свитшот', 'sweatshirt', 'sweat'], ['свитшот']],
  [['футболк', 'футболка', 'подволк', 'tee', 't-shirt', 'tshirt', 'майк'], ['футболк']],
  [['цамц', 'shirt'], ['цамц']],
  [['свитер', 'sweater', 'сүлжмэл', 'knit', 'кофт'], ['свитер', 'сүлжмэл', 'кардиган']],
  [['кардиган', 'cardigan'], ['кардиган']],
  [['хүрэм', 'куртка', 'kurtka', 'jacket'], ['хүрэм']],
  [['пальто', 'coat', 'палто'], ['пальто']],
  [['пуховик', 'puffer', 'өвлийн хүрэм', 'дулаан хүрэм'], ['пуховик', 'дулаан']],
  [['жинс', 'jeans', 'denim', 'жийнс'], ['жинс']],
  [['өмд', 'pants', 'trousers', 'umd'], ['өмд']],
  [['ороолт', 'алчуур', 'scarf', 'ороолтын'], ['ороолт']],
  [['малгай', 'beanie', 'cap', 'hat'], ['малгай']],
  [['цүнх', 'bag', 'tote'], ['цүнх']],
  [['бүс', 'belt'], ['бүс']],
  [['оймс', 'socks'], ['оймс']],
  [['ноолуур', 'cashmere', 'ноолууран'], ['ноолуур']],
  [['ноос', 'wool', 'ноосон'], ['ноос']],
  [['арьс', 'leather', 'арьсан'], ['арьс']],
  [['маалинга', 'linen', 'маалинган'], ['маалинга']],
  [['өвөл', 'өвлийн', 'winter', 'дулаан', 'хүйтэн'], ['winter']],
  [['намар', 'намрын', 'autumn', 'fall'], ['autumn']],
  [['зун', 'зуны', 'summer'], ['summer']],
  [['оверсайз', 'oversized', 'том хэмжээтэй', 'чөлөөтэй'], ['oversized', 'чөлөөтэй']],
]

const STOP_WORDS = new Set(['байна', 'байгаа', 'юу', 'уу', 'үү', 'вэ', 'бэ', 'ямар', 'танайд', 'танай', 'надад', 'хэрэгтэй', 'the', 'a', 'and', 'for', 'with'])

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchableText(p: CatalogProduct, tagLabels: Record<string, string>): string {
  return normalizeText(
    [
      p.name,
      p.categoryName,
      p.shortDescription,
      p.material,
      p.fit ?? '',
      ...p.tags,
      ...p.tags.map((tag) => tagLabels[tag] ?? ''),
      ...p.colors.map((c) => c.name),
    ].join(' '),
  )
}

/** Each query word must match the product (directly, by prefix, or through a synonym). */
export function matchesQuery(p: CatalogProduct, query: string, tagLabels: Record<string, string> = {}): boolean {
  const words = normalizeText(query)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  if (words.length === 0) return true
  const text = searchableText(p, tagLabels)
  return words.every((word) => {
    if (text.includes(word)) return true
    // Mongolian is suffixing: "хүрмүүд", "свитерүүд" — try a shortened stem.
    if (word.length >= 5 && text.includes(word.slice(0, word.length - 2))) return true
    for (const [inputs, targets] of SYNONYMS) {
      if (inputs.some((i) => word === i || (i.length >= 4 && word.startsWith(i)))) {
        if (targets.some((target) => text.includes(target))) return true
      }
    }
    return false
  })
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface CatalogFilters {
  category?: string | null
  collection?: string | null
  audience?: Audience | null
  sizes?: string[]
  colors?: ColorFamily[]
  price?: PriceBucketKey | null
  maxPrice?: number | null
  minPrice?: number | null
  inStockOnly?: boolean
  q?: string | null
  sort?: SortKey
}

function sellable(v: CatalogVariant) {
  return v.isActive && v.stock > 0
}

export function availabilityOf(p: CatalogProduct): Availability {
  return productAvailability(p.variants)
}

/**
 * Rule-based collections: membership follows product data instead of a hand-made list,
 * so "new" and "women/men" can never drift out of date. Other collections use links.
 */
export const SMART_COLLECTIONS: Record<string, { rule: string; test: (p: CatalogProduct) => boolean }> = {
  new: { rule: '«Шинэ ирэлт» гэж тэмдэглэсэн бүх бараа', test: (p) => p.isNewArrival },
  women: { rule: 'Эмэгтэй болон хүйс харгалзахгүй бараа', test: (p) => p.audience === 'women' || p.audience === 'unisex' },
  men: { rule: 'Эрэгтэй болон хүйс харгалзахгүй бараа', test: (p) => p.audience === 'men' || p.audience === 'unisex' },
}

export function inCollection(p: CatalogProduct, slug: string): boolean {
  const smart = SMART_COLLECTIONS[slug]
  return smart ? smart.test(p) : p.collectionSlugs.includes(slug)
}

export function filterCatalog(products: CatalogProduct[], f: CatalogFilters, tagLabels: Record<string, string> = {}): CatalogProduct[] {
  const bucket = f.price ? PRICE_BUCKETS.find((b) => b.key === f.price) : null
  const sizes = f.sizes?.length ? new Set(f.sizes) : null
  const colors = f.colors?.length ? new Set(f.colors) : null

  const out = products.filter((p) => {
    if (f.category && p.categorySlug !== f.category) return false
    if (f.collection && !inCollection(p, f.collection)) return false
    if (f.audience && p.audience !== f.audience && p.audience !== 'unisex') return false
    if (bucket && (p.minPrice < bucket.min || (bucket.max !== null && p.minPrice >= bucket.max))) return false
    if (f.maxPrice != null && p.minPrice > f.maxPrice) return false
    if (f.minPrice != null && p.maxPrice < f.minPrice) return false
    if (f.q && !matchesQuery(p, f.q, tagLabels)) return false

    // Size, colour and stock filters apply to the same variant: "black in L, in stock"
    // must be one real variant, not black in S plus grey in L.
    if (sizes || colors || f.inStockOnly) {
      const colorById = new Map(p.colors.map((c) => [c.id, c]))
      const ok = p.variants.some((v) => {
        if (!v.isActive) return false
        if (sizes && !sizes.has(v.size)) return false
        if (colors) {
          const c = colorById.get(v.colorId)
          if (!c || !colors.has(colorFamily(c.hex))) return false
        }
        if (f.inStockOnly && !sellable(v)) return false
        return true
      })
      if (!ok) return false
    }
    return true
  })

  return sortCatalog(out, f.sort ?? 'featured')
}

export function sortCatalog(products: CatalogProduct[], sort: SortKey): CatalogProduct[] {
  const list = [...products]
  const byOrder = (a: CatalogProduct, b: CatalogProduct) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.minPrice - b.minPrice || byOrder(a, b))
    case 'price-desc':
      return list.sort((a, b) => b.minPrice - a.minPrice || byOrder(a, b))
    case 'newest':
      return list.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || byOrder(a, b))
    default:
      // Featured first, then products that can actually be bought, then the merchandising order.
      return list.sort(
        (a, b) =>
          Number(b.isFeatured) - Number(a.isFeatured) ||
          Number(availabilityOf(b) !== 'out_of_stock') - Number(availabilityOf(a) !== 'out_of_stock') ||
          byOrder(a, b),
      )
  }
}

/** Facet values present in a product list (only offer filters that can match something). */
export function facetsOf(products: CatalogProduct[]) {
  const sizes = new Set<string>()
  const families = new Set<ColorFamily>()
  for (const p of products) {
    for (const v of p.variants) if (v.isActive) sizes.add(v.size)
    for (const c of p.colors) families.add(colorFamily(c.hex))
  }
  return {
    sizes: [...sizes].sort(compareSizes),
    colors: (Object.keys(COLOR_FAMILIES) as ColorFamily[]).filter((f) => families.has(f)),
  }
}
