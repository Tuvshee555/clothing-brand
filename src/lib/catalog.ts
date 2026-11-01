// Catalogue vocabulary shared by the storefront, admin and assistant (isomorphic).

export type Audience = 'women' | 'men' | 'unisex'
export type ProductStatus = 'draft' | 'active' | 'archived'

export const AUDIENCE_LABELS: Record<Audience, string> = {
  women: 'Эмэгтэй',
  men: 'Эрэгтэй',
  unisex: 'Хүйс харгалзахгүй',
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Ноорог',
  active: 'Нийтлэгдсэн',
  archived: 'Архивласан',
}

/** Display order for sizes; anything unknown sorts after, alphabetically. */
export const SIZE_ORDER = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL',
  '26', '27', '28', '29', '30', '31', '32', '33', '34', '36', '38',
  '80', '85', '90', '95', '100', '105', '110',
  'S/M', 'M/L', 'L/XL', 'ONE SIZE',
]

export function compareSizes(a: string, b: string): number {
  const ia = SIZE_ORDER.indexOf(a)
  const ib = SIZE_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return a.localeCompare(b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

export function sizeLabel(size: string): string {
  return size === 'ONE SIZE' ? 'Нэг хэмжээ' : size
}

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unavailable'

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  in_stock: 'Бэлэн байгаа',
  low_stock: 'Цөөн үлдсэн',
  out_of_stock: 'Дууссан',
  unavailable: 'Худалдаанд байхгүй',
}

export function variantAvailability(v: { stock: number; lowStockThreshold: number; isActive: boolean }): Availability {
  if (!v.isActive) return 'unavailable'
  if (v.stock <= 0) return 'out_of_stock'
  if (v.stock <= v.lowStockThreshold) return 'low_stock'
  return 'in_stock'
}

/** Most a single cart line may hold (matches the database check constraint). */
export const MAX_LINE_QUANTITY = 20

/** Product-level availability from its sellable variants. */
export function productAvailability(variants: { stock: number; lowStockThreshold: number; isActive: boolean }[]): Availability {
  const active = variants.filter((v) => v.isActive)
  if (active.length === 0) return 'unavailable'
  const total = active.reduce((sum, v) => sum + Math.max(0, v.stock), 0)
  if (total === 0) return 'out_of_stock'
  const lowAll = active.every((v) => v.stock <= v.lowStockThreshold)
  return lowAll ? 'low_stock' : 'in_stock'
}

/** Catalogue sort options (URL value → label). */
export const SORT_OPTIONS = {
  featured: 'Онцлох',
  newest: 'Шинэ нь эхэндээ',
  'price-asc': 'Үнэ: багаас их',
  'price-desc': 'Үнэ: ихээс бага',
} as const
export type SortKey = keyof typeof SORT_OPTIONS

/** Price filter buckets for the catalogue (inclusive lower bound, exclusive upper). */
export const PRICE_BUCKETS = [
  { key: 'u100', label: '100,000₮ хүртэл', min: 0, max: 100_000 },
  { key: '100-200', label: '100,000–200,000₮', min: 100_000, max: 200_000 },
  { key: '200-300', label: '200,000–300,000₮', min: 200_000, max: 300_000 },
  { key: 'o300', label: '300,000₮-аас дээш', min: 300_000, max: null },
] as const
export type PriceBucketKey = (typeof PRICE_BUCKETS)[number]['key']

/** Tags the assistant and filters understand, with Mongolian labels. */
export const TAG_LABELS: Record<string, string> = {
  winter: 'Өвөлд',
  autumn: 'Намарт',
  summer: 'Зунд',
  layering: 'Давхарлахад',
  oversized: 'Чөлөөтэй хэлбэр',
  essential: 'Суурь хувцас',
  cashmere: 'Ноолуур',
  wool: 'Ноос',
  cotton: 'Хөвөн',
  linen: 'Маалинга',
  denim: 'Жинс',
  leather: 'Арьс',
  office: 'Оффист',
}
