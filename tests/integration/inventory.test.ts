import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as t from '@/server/db/schema'
import { addColor, addVariants, createProduct, updateVariant } from '@/server/services/catalog-admin'
import { adjustStock } from '@/server/services/inventory'
import { loadCatalog } from '@/server/queries/catalog'
import { createTestDb, ctx, ownerActor, stockOf, variant, type TestDb } from './helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

describe('seeded catalogue', () => {
  it('has 30 published products with images, variants and unique SKUs', async () => {
    const catalog = await loadCatalog(db)
    expect(catalog).toHaveLength(30)
    for (const p of catalog) {
      expect(p.images.length).toBeGreaterThan(0)
      expect(p.variants.length).toBeGreaterThan(0)
      expect(p.minPrice).toBeGreaterThan(0)
    }
    const skus = catalog.flatMap((p) => p.variants.map((v) => v.sku))
    expect(new Set(skus).size).toBe(skus.length)
  })

  it('keeps the ledger consistent: every variant stock equals the sum of its movements', async () => {
    const rows = await db.execute<{ mismatches: number }>(sql`
      select count(*)::int as mismatches from store.product_variants v
      left join (select variant_id, sum(delta)::int as total from store.inventory_transactions group by variant_id) l on l.variant_id = v.id
      where v.stock <> coalesce(l.total, 0)`)
    expect(rows.rows[0].mismatches).toBe(0)
  })
})

describe('stock adjustments', () => {
  it('adds, sets and refuses to go below zero — always with a ledger row', async () => {
    const owner = await ownerActor(db)
    const v = await variant(db, 'chunky-knit-scarf', 'grey', 'ONE SIZE')
    await adjustStock({ ...ctx(db), actor: owner }, { variantId: v.id, mode: 'delta', value: 5, reason: 'restock', note: 'Шинэ орлого' })
    expect(await stockOf(db, v.id)).toBe(v.stock + 5)
    await adjustStock({ ...ctx(db), actor: owner }, { variantId: v.id, mode: 'set', value: 3, reason: 'adjustment' })
    expect(await stockOf(db, v.id)).toBe(3)
    await expect(adjustStock({ ...ctx(db), actor: owner }, { variantId: v.id, mode: 'delta', value: -4, reason: 'damaged' })).rejects.toMatchObject({ code: 'insufficient_stock' })
    expect(await stockOf(db, v.id)).toBe(3)
    const ledger = await db.select().from(t.inventoryTransactions).where(eq(t.inventoryTransactions.variantId, v.id))
    expect(ledger.filter((l) => l.reason === 'restock')).toHaveLength(1)
    expect(ledger.filter((l) => l.reason === 'adjustment')[0]).toMatchObject({ stockAfter: 3, actorLabel: owner.name })
  })

  it('cannot be pushed below zero even by direct SQL (database check)', async () => {
    const v = await variant(db, 'cotton-baseball-cap', 'mustard', 'ONE SIZE')
    await expect(db.update(t.productVariants).set({ stock: -1 }).where(eq(t.productVariants.id, v.id))).rejects.toThrow()
  })
})

describe('catalogue admin', () => {
  it('creates a product, colours and per-size variants with generated SKUs and initial stock', async () => {
    const owner = await ownerActor(db)
    const [cat] = await db.select().from(t.categories).where(eq(t.categories.slug, 't-shirts'))
    const { id } = await createProduct({ ...ctx(db), actor: owner }, {
      name: 'Тест урт ханцуйтай футболк',
      slug: 'test-long-sleeve',
      categoryId: cat.id,
      audience: 'unisex',
      shortDescription: 'Тест бараа — урт ханцуйтай хөвөн футболк.',
      description: 'Интеграцийн тестэд үүсгэсэн бараа. Үлдэгдэл, SKU үүсэхийг шалгана.',
      material: '100% хөвөн',
      care: '30°C-д угаана',
      fit: null,
      basePrice: 99_000,
      status: 'draft',
      isFeatured: false,
      isNewArrival: true,
      tags: ['cotton'],
      collectionIds: [],
      seoTitle: null,
      seoDescription: null,
    })
    await expect(
      createProduct({ ...ctx(db), actor: owner }, { name: 'Давхар', slug: 'test-long-sleeve', categoryId: cat.id, audience: 'unisex', shortDescription: 'Давхардсан хаяг шалгах', description: 'Давхардсан вэб хаягтай бараа үүсгэх оролдлого.', material: 'хөвөн', care: 'угаана', fit: null, basePrice: 1000, status: 'draft', isFeatured: false, isNewArrival: false, tags: [], collectionIds: [], seoTitle: null, seoDescription: null }),
    ).rejects.toMatchObject({ code: 'slug_taken' })
    const color = await addColor({ ...ctx(db), actor: owner }, { productId: id, name: 'Хар', code: 'black', hex: '#111111' })
    const { created } = await addVariants({ ...ctx(db), actor: owner }, { productId: id, colorId: color.id, sizes: ['S', 'M', 'L'], initialStock: 4 })
    expect(created).toHaveLength(3)
    expect(new Set(created).size).toBe(3)
    const variants = await db.select().from(t.productVariants).where(eq(t.productVariants.productId, id))
    expect(variants.map((v) => v.stock)).toEqual([4, 4, 4])
    await expect(addVariants({ ...ctx(db), actor: owner }, { productId: id, colorId: color.id, sizes: ['M'], initialStock: 1 })).rejects.toMatchObject({ code: 'exists' })
    const firstSku = variants[0].sku
    await expect(updateVariant({ ...ctx(db), actor: owner }, { variantId: variants[1].id, sku: firstSku, priceOverride: null, lowStockThreshold: 1, isActive: true })).rejects.toMatchObject({
      code: 'sku_taken',
    })
    await updateVariant({ ...ctx(db), actor: owner }, { variantId: variants[1].id, sku: variants[1].sku, priceOverride: 109_000, lowStockThreshold: 2, isActive: true })
    const [updated] = await db.select().from(t.productVariants).where(eq(t.productVariants.id, variants[1].id))
    expect(updated.priceOverride).toBe(109_000)
  })
})
