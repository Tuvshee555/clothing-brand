// Public catalogue read models. Everything here comes from the database; the
// storefront and the assistant never carry their own product lists.
//
// Cached helpers ('use cache') hold product data for the listing and product
// pages and are invalidated with updateTag('catalog') by every server action
// that changes products, stock or orders. Live stock for the product page and
// for the assistant is read uncached.
import 'server-only'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { compareSizes } from '@/lib/catalog'
import type { CatalogProduct } from '@/lib/catalog-filter'
import { variantPrice } from '@/lib/money'
import { db } from '@/server/db'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'

export const CATALOG_TAG = 'catalog'
export const SETTINGS_TAG = 'settings'

/** Loads every published product with its colours, images, variants and live stock. */
export async function loadCatalog(database: Database, opts: { productIds?: string[] } = {}): Promise<CatalogProduct[]> {
  const where = opts.productIds
    ? and(eq(t.products.status, 'active'), inArray(t.products.id, opts.productIds))
    : eq(t.products.status, 'active')
  const rows = await database
    .select({
      id: t.products.id,
      slug: t.products.slug,
      name: t.products.name,
      categorySlug: t.categories.slug,
      categoryName: t.categories.name,
      categoryActive: t.categories.isActive,
      audience: t.products.audience,
      shortDescription: t.products.shortDescription,
      material: t.products.material,
      fit: t.products.fit,
      basePrice: t.products.basePrice,
      isFeatured: t.products.isFeatured,
      isNewArrival: t.products.isNewArrival,
      tags: t.products.tags,
      sortOrder: t.products.sortOrder,
      publishedAt: t.products.publishedAt,
    })
    .from(t.products)
    .innerJoin(t.categories, eq(t.categories.id, t.products.categoryId))
    .where(where)
    .orderBy(asc(t.products.sortOrder), asc(t.products.name))
  const visible = rows.filter((r) => r.categoryActive)
  if (visible.length === 0) return []
  const ids = visible.map((r) => r.id)

  const [colors, images, variants, links] = await Promise.all([
    database.select().from(t.productColors).where(inArray(t.productColors.productId, ids)).orderBy(asc(t.productColors.sortOrder)),
    database.select().from(t.productImages).where(inArray(t.productImages.productId, ids)).orderBy(asc(t.productImages.sortOrder)),
    database.select().from(t.productVariants).where(inArray(t.productVariants.productId, ids)).orderBy(asc(t.productVariants.sortOrder)),
    database
      .select({ productId: t.productCollections.productId, slug: t.collections.slug })
      .from(t.productCollections)
      .innerJoin(t.collections, eq(t.collections.id, t.productCollections.collectionId))
      .where(and(inArray(t.productCollections.productId, ids), eq(t.collections.isActive, true))),
  ])

  return visible.map((p) => {
    const pColors = colors.filter((c) => c.productId === p.id)
    const colorCode = new Map(pColors.map((c) => [c.id, c.code]))
    const pVariants = variants
      .filter((v) => v.productId === p.id)
      .map((v) => ({
        id: v.id,
        colorId: v.colorId,
        colorCode: colorCode.get(v.colorId) ?? '',
        size: v.size,
        sku: v.sku,
        price: variantPrice(p.basePrice, v.priceOverride),
        stock: v.stock,
        lowStockThreshold: v.lowStockThreshold,
        isActive: v.isActive,
      }))
    const activePrices = pVariants.filter((v) => v.isActive).map((v) => v.price)
    const prices = activePrices.length ? activePrices : [p.basePrice]
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      categorySlug: p.categorySlug,
      categoryName: p.categoryName,
      audience: p.audience,
      shortDescription: p.shortDescription,
      material: p.material,
      fit: p.fit,
      basePrice: p.basePrice,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      isFeatured: p.isFeatured,
      isNewArrival: p.isNewArrival,
      tags: p.tags,
      sortOrder: p.sortOrder,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      collectionSlugs: links.filter((l) => l.productId === p.id).map((l) => l.slug),
      colors: pColors.map((c) => ({ id: c.id, code: c.code, name: c.name, hex: c.hex })),
      sizes: [...new Set(pVariants.filter((v) => v.isActive).map((v) => v.size))].sort(compareSizes),
      images: images.filter((i) => i.productId === p.id).map((i) => ({ url: i.url, alt: i.alt, colorId: i.colorId })),
      variants: pVariants,
    }
  })
}

/** Cached catalogue for listing pages. */
export async function getCatalog(): Promise<CatalogProduct[]> {
  'use cache'
  cacheTag(CATALOG_TAG)
  cacheLife('hours')
  return loadCatalog(db)
}

export async function getNavigation() {
  'use cache'
  cacheTag(CATALOG_TAG)
  cacheLife('hours')
  const [categories, collections] = await Promise.all([
    db.select().from(t.categories).where(eq(t.categories.isActive, true)).orderBy(asc(t.categories.sortOrder)),
    db.select().from(t.collections).where(eq(t.collections.isActive, true)).orderBy(asc(t.collections.sortOrder)),
  ])
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, description: c.description, imageUrl: c.imageUrl })),
    collections: collections.map((c) => ({
      slug: c.slug,
      name: c.name,
      eyebrow: c.eyebrow,
      description: c.description,
      imageUrl: c.imageUrl,
      isFeatured: c.isFeatured,
    })),
  }
}

/** Full product content for the product page (no stock — that is read live). */
export async function getProductDetail(slug: string) {
  'use cache'
  cacheTag(CATALOG_TAG)
  cacheLife('hours')
  const [product] = await db
    .select({
      id: t.products.id,
      slug: t.products.slug,
      name: t.products.name,
      status: t.products.status,
      audience: t.products.audience,
      shortDescription: t.products.shortDescription,
      description: t.products.description,
      material: t.products.material,
      care: t.products.care,
      fit: t.products.fit,
      basePrice: t.products.basePrice,
      tags: t.products.tags,
      isNewArrival: t.products.isNewArrival,
      isFeatured: t.products.isFeatured,
      seoTitle: t.products.seoTitle,
      seoDescription: t.products.seoDescription,
      categorySlug: t.categories.slug,
      categoryName: t.categories.name,
    })
    .from(t.products)
    .innerJoin(t.categories, eq(t.categories.id, t.products.categoryId))
    .where(and(eq(t.products.slug, slug), eq(t.products.status, 'active'), eq(t.categories.isActive, true)))
    .limit(1)
  if (!product) return null
  const [colors, images, variants] = await Promise.all([
    db.select().from(t.productColors).where(eq(t.productColors.productId, product.id)).orderBy(asc(t.productColors.sortOrder)),
    db.select().from(t.productImages).where(eq(t.productImages.productId, product.id)).orderBy(asc(t.productImages.sortOrder)),
    db
      .select({
        id: t.productVariants.id,
        colorId: t.productVariants.colorId,
        size: t.productVariants.size,
        sku: t.productVariants.sku,
        priceOverride: t.productVariants.priceOverride,
        isActive: t.productVariants.isActive,
      })
      .from(t.productVariants)
      .where(eq(t.productVariants.productId, product.id))
      .orderBy(asc(t.productVariants.sortOrder)),
  ])
  return {
    ...product,
    colors: colors.map((c) => ({ id: c.id, code: c.code, name: c.name, hex: c.hex })),
    images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, colorId: i.colorId, width: i.width, height: i.height, credit: i.credit })),
    variants: variants.map((v) => ({
      id: v.id,
      colorId: v.colorId,
      size: v.size,
      sku: v.sku,
      price: variantPrice(product.basePrice, v.priceOverride),
      isActive: v.isActive,
    })),
    sizes: [...new Set(variants.filter((v) => v.isActive).map((v) => v.size))].sort(compareSizes),
  }
}
export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductDetail>>>

/** Live stock per variant (uncached) — what the size/colour picker shows. */
export async function getVariantStock(productId: string) {
  const rows = await db
    .select({
      id: t.productVariants.id,
      stock: t.productVariants.stock,
      lowStockThreshold: t.productVariants.lowStockThreshold,
      isActive: t.productVariants.isActive,
    })
    .from(t.productVariants)
    .where(eq(t.productVariants.productId, productId))
  return rows
}

/** Best sellers by units in recorded (sample) orders, excluding cancelled ones. */
export async function getBestsellerIds(limit = 8): Promise<string[]> {
  'use cache'
  cacheTag(CATALOG_TAG)
  cacheLife('hours')
  const rows = await db
    .select({ productId: t.orderItems.productId, units: sql<number>`sum(${t.orderItems.quantity})::int` })
    .from(t.orderItems)
    .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
    .where(and(ne(t.orders.status, 'cancelled'), sql`${t.orderItems.productId} is not null`))
    .groupBy(t.orderItems.productId)
    .orderBy(desc(sql`sum(${t.orderItems.quantity})`))
    .limit(limit)
  return rows.map((r) => r.productId!).filter(Boolean)
}
