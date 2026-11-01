import { describe, expect, it } from 'vitest'
import { TAG_LABELS } from '@/lib/catalog'
import { colorFamily, facetsOf, filterCatalog, inCollection, matchesQuery, sortCatalog, type CatalogProduct } from '@/lib/catalog-filter'

function product(over: Partial<CatalogProduct> & { slug: string }): CatalogProduct {
  return {
    id: over.slug,
    name: over.slug,
    categorySlug: 'hoodies',
    categoryName: 'Hoodie, свитшот',
    audience: 'unisex',
    shortDescription: '',
    material: 'хөвөн',
    fit: null,
    basePrice: 100_000,
    minPrice: 100_000,
    maxPrice: 100_000,
    isFeatured: false,
    isNewArrival: false,
    tags: [],
    sortOrder: 0,
    publishedAt: null,
    collectionSlugs: [],
    colors: [],
    sizes: [],
    images: [],
    variants: [],
    ...over,
  }
}

const black = { id: 'c-black', code: 'black', name: 'Хар', hex: '#161616' }
const grey = { id: 'c-grey', code: 'grey', name: 'Саарал', hex: '#c9c8c4' }

const hoodie = product({
  slug: 'oversized-hoodie',
  name: 'Оверсайз hoodie',
  tags: ['oversized', 'cotton'],
  colors: [black, grey],
  variants: [
    { id: 'v1', colorId: 'c-black', colorCode: 'black', size: 'S', sku: 'A', price: 219_000, stock: 0, lowStockThreshold: 1, isActive: true },
    { id: 'v2', colorId: 'c-black', colorCode: 'black', size: 'L', sku: 'B', price: 219_000, stock: 5, lowStockThreshold: 1, isActive: true },
    { id: 'v3', colorId: 'c-grey', colorCode: 'grey', size: 'S', sku: 'C', price: 219_000, stock: 3, lowStockThreshold: 1, isActive: true },
  ],
  minPrice: 219_000,
  maxPrice: 219_000,
})
const coat = product({
  slug: 'wool-coat',
  name: 'Ноосон пальто',
  categorySlug: 'outerwear',
  categoryName: 'Хүрэм, пальто',
  audience: 'women',
  tags: ['wool', 'winter'],
  material: '80% ноос',
  colors: [black],
  isNewArrival: true,
  variants: [{ id: 'v4', colorId: 'c-black', colorCode: 'black', size: 'M', sku: 'D', price: 459_000, stock: 2, lowStockThreshold: 1, isActive: true }],
  minPrice: 459_000,
  maxPrice: 459_000,
  publishedAt: '2026-10-30T00:00:00.000Z',
})
const tee = product({
  slug: 'tee',
  name: 'Суурь хөвөн футболк',
  categorySlug: 't-shirts',
  categoryName: 'Футболк',
  audience: 'men',
  isFeatured: true,
  colors: [grey],
  variants: [{ id: 'v5', colorId: 'c-grey', colorCode: 'grey', size: 'M', sku: 'E', price: 89_000, stock: 9, lowStockThreshold: 1, isActive: true }],
  minPrice: 89_000,
  maxPrice: 89_000,
  publishedAt: '2026-01-01T00:00:00.000Z',
})
const catalog = [hoodie, coat, tee]

describe('colorFamily', () => {
  it('classifies the palette into filter families', () => {
    expect(colorFamily('#161616')).toBe('black')
    expect(colorFamily('#c9c8c4')).toBe('grey')
    expect(colorFamily('#f3f1ec')).toBe('white')
    expect(colorFamily('#cdb89a')).toBe('beige')
    expect(colorFamily('#6b4a33')).toBe('brown')
    expect(colorFamily('#2c3e5c')).toBe('blue')
    expect(colorFamily('#5f6345')).toBe('green')
    expect(colorFamily('#7a2430')).toBe('red')
  })
})

describe('matchesQuery', () => {
  it('understands Latin, Cyrillic and transliterated product words', () => {
    expect(matchesQuery(hoodie, 'hoodie')).toBe(true)
    expect(matchesQuery(hoodie, 'худи')).toBe(true)
    expect(matchesQuery(coat, 'coat')).toBe(true)
    expect(matchesQuery(coat, 'ноос')).toBe(true)
    expect(matchesQuery(tee, 'пальто')).toBe(false)
  })
  it('matches tags through their labels and synonyms', () => {
    expect(matchesQuery(coat, 'өвлийн', TAG_LABELS)).toBe(true)
    expect(matchesQuery(tee, 'өвлийн', TAG_LABELS)).toBe(false)
  })
})

describe('filterCatalog', () => {
  it('requires size, colour and stock to hold on the same variant', () => {
    // Black hoodie exists in S (sold out) and L (in stock); grey in S.
    expect(filterCatalog(catalog, { colors: ['black'], sizes: ['L'], inStockOnly: true }).map((p) => p.slug)).toEqual(['oversized-hoodie'])
    expect(filterCatalog(catalog, { colors: ['black'], sizes: ['S'], inStockOnly: true }).map((p) => p.slug)).toEqual([])
    // Black in S exists but is sold out: without the stock filter the product still matches.
    expect(filterCatalog(catalog, { colors: ['black'], sizes: ['S'] }).map((p) => p.slug)).toEqual(['oversized-hoodie'])
  })
  it('filters by category, price bucket and audience', () => {
    expect(filterCatalog(catalog, { category: 'outerwear' }).map((p) => p.slug)).toEqual(['wool-coat'])
    expect(filterCatalog(catalog, { price: 'u100' }).map((p) => p.slug)).toEqual(['tee'])
    expect(filterCatalog(catalog, { maxPrice: 220_000, sort: 'price-asc' }).map((p) => p.slug)).toEqual(['tee', 'oversized-hoodie'])
    expect(filterCatalog(catalog, { audience: 'women' }).map((p) => p.slug).sort()).toEqual(['oversized-hoodie', 'wool-coat'])
  })
  it('sorts by price and recency', () => {
    expect(sortCatalog(catalog, 'price-desc').map((p) => p.slug)).toEqual(['wool-coat', 'oversized-hoodie', 'tee'])
    expect(sortCatalog(catalog, 'newest')[0].slug).toBe('wool-coat')
    expect(sortCatalog(catalog, 'featured')[0].slug).toBe('tee')
  })
  it('derives rule-based collections from product data', () => {
    expect(inCollection(coat, 'new')).toBe(true)
    expect(inCollection(tee, 'new')).toBe(false)
    expect(inCollection(hoodie, 'men')).toBe(true) // unisex appears in both
    expect(inCollection(coat, 'men')).toBe(false)
  })
  it('offers only facets that exist', () => {
    const facets = facetsOf(catalog)
    expect(facets.sizes).toEqual(['S', 'M', 'L'])
    expect(facets.colors).toEqual(['black', 'grey'])
  })
})
