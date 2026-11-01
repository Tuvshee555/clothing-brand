// Catalogue management for the admin: products, colours, variants, images,
// categories, collections, delivery options and store settings. Inputs are
// validated with zod; permissions are checked by the action runner.
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { skuPart } from '@/lib/slug'
import {
  categoryInput,
  collectionInput,
  colorInput,
  policyInput,
  productInput,
  shippingMethodInput,
  storeInfoInput,
  variantCreateInput,
  variantUpdateInput,
} from '@/lib/validation/admin'
import { id as idSchema } from '@/lib/validation/common'
import type { Policies } from '@/lib/settings'
import { actorLabel, audit } from '@/server/audit'
import { ERR, ServiceError, type Actor, type ServiceContext } from '@/server/context'
import * as t from '@/server/db/schema'
import { loadPolicies } from '@/server/queries/settings'
import { applyStockChange } from './inventory'

type Ctx = ServiceContext & { actor: Actor }

async function assertSlugFree(ctx: Ctx, slug: string, exceptId?: string) {
  const [clash] = await ctx.db
    .select({ id: t.products.id })
    .from(t.products)
    .where(exceptId ? and(eq(t.products.slug, slug), ne(t.products.id, exceptId)) : eq(t.products.slug, slug))
    .limit(1)
  if (clash) throw new ServiceError('slug_taken', 'Энэ вэб хаягтай бараа аль хэдийн байна.', { slug: 'Өөр вэб хаяг сонгоно уу.' })
}

export async function createProduct(ctx: Ctx, raw: unknown) {
  const input = productInput.parse(raw)
  await assertSlugFree(ctx, input.slug)
  return ctx.db.transaction(async (tx) => {
    const [{ maxSort }] = await tx.select({ maxSort: sql<number>`coalesce(max(${t.products.sortOrder}), 0)::int` }).from(t.products)
    const [product] = await tx
      .insert(t.products)
      .values({
        ...input,
        fit: input.fit,
        tags: [...new Set(input.tags)],
        sortOrder: maxSort + 1,
        isDemo: true,
        publishedAt: input.status === 'active' ? ctx.now : null,
      })
      .returning({ id: t.products.id })
    if (input.collectionIds.length) {
      await tx.insert(t.productCollections).values(input.collectionIds.map((collectionId) => ({ productId: product.id, collectionId })))
    }
    await audit(tx, ctx.actor, 'product.created', { type: 'product', id: product.id }, { name: input.name })
    return { id: product.id }
  })
}

export async function updateProduct(ctx: Ctx, productId: string, raw: unknown) {
  idSchema.parse(productId)
  const input = productInput.parse(raw)
  await assertSlugFree(ctx, input.slug, productId)
  return ctx.db.transaction(async (tx) => {
    const [before] = await tx.select().from(t.products).where(eq(t.products.id, productId)).for('update')
    if (!before) throw ERR.notFound('Бараа')
    if (input.status === 'active') {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(t.productVariants)
        .where(and(eq(t.productVariants.productId, productId), eq(t.productVariants.isActive, true)))
      if (n === 0) throw new ServiceError('no_variants', 'Нийтлэхийн өмнө дор хаяж нэг өнгө, хэмжээ (хувилбар) нэмнэ үү.', { status: 'Хувилбаргүй барааг нийтлэх боломжгүй.' })
    }
    await tx
      .update(t.products)
      .set({
        ...input,
        tags: [...new Set(input.tags)],
        publishedAt: input.status === 'active' ? (before.publishedAt ?? ctx.now) : before.publishedAt,
      })
      .where(eq(t.products.id, productId))
    await tx.delete(t.productCollections).where(eq(t.productCollections.productId, productId))
    if (input.collectionIds.length) {
      await tx.insert(t.productCollections).values(input.collectionIds.map((collectionId) => ({ productId, collectionId })))
    }
    const changes = Object.entries(input)
      .filter(([k, v]) => k in before && JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v))
      .map(([k]) => k)
    await audit(tx, ctx.actor, before.status !== input.status ? 'product.status_changed' : 'product.updated', { type: 'product', id: productId }, {
      changes,
      ...(before.basePrice !== input.basePrice ? { priceBefore: before.basePrice, priceAfter: input.basePrice } : {}),
      ...(before.status !== input.status ? { statusBefore: before.status, statusAfter: input.status } : {}),
    })
    return { id: productId }
  })
}

export async function addColor(ctx: Ctx, raw: unknown) {
  const input = colorInput.parse(raw)
  const [product] = await ctx.db.select({ id: t.products.id }).from(t.products).where(eq(t.products.id, input.productId)).limit(1)
  if (!product) throw ERR.notFound('Бараа')
  const [clash] = await ctx.db
    .select({ id: t.productColors.id })
    .from(t.productColors)
    .where(and(eq(t.productColors.productId, input.productId), eq(t.productColors.code, input.code)))
    .limit(1)
  if (clash) throw new ServiceError('color_exists', 'Энэ өнгө аль хэдийн нэмэгдсэн байна.', { code: 'Өөр код сонгоно уу.' })
  const [{ maxSort }] = await ctx.db
    .select({ maxSort: sql<number>`coalesce(max(${t.productColors.sortOrder}), -1)::int` })
    .from(t.productColors)
    .where(eq(t.productColors.productId, input.productId))
  const [color] = await ctx.db
    .insert(t.productColors)
    .values({ productId: input.productId, code: input.code, name: input.name, hex: input.hex.toLowerCase(), sortOrder: maxSort + 1 })
    .returning({ id: t.productColors.id })
  await audit(ctx.db, ctx.actor, 'color.created', { type: 'product', id: input.productId }, { color: input.name })
  return { id: color.id }
}

export async function addVariants(ctx: Ctx, raw: unknown) {
  const input = variantCreateInput.parse(raw)
  return ctx.db.transaction(async (tx) => {
    const [product] = await tx.select({ id: t.products.id, slug: t.products.slug }).from(t.products).where(eq(t.products.id, input.productId)).limit(1)
    const [color] = await tx
      .select({ id: t.productColors.id, code: t.productColors.code })
      .from(t.productColors)
      .where(and(eq(t.productColors.id, input.colorId), eq(t.productColors.productId, input.productId)))
      .limit(1)
    if (!product || !color) throw ERR.notFound('Бараа эсвэл өнгө')
    const existing = await tx
      .select({ size: t.productVariants.size })
      .from(t.productVariants)
      .where(and(eq(t.productVariants.productId, product.id), eq(t.productVariants.colorId, color.id)))
    const sizes = [...new Set(input.sizes)].filter((s) => !existing.some((e) => e.size === s))
    if (sizes.length === 0) throw new ServiceError('exists', 'Эдгээр хэмжээ энэ өнгөнд аль хэдийн байна.', { sizes: 'Шинэ хэмжээ оруулна уу.' })
    const [{ maxSort }] = await tx
      .select({ maxSort: sql<number>`coalesce(max(${t.productVariants.sortOrder}), -1)::int` })
      .from(t.productVariants)
      .where(eq(t.productVariants.productId, product.id))
    const created: string[] = []
    for (const [i, size] of sizes.entries()) {
      const base = `MN-${skuPart(product.slug, 8)}-${skuPart(color.code, 6)}-${size === 'ONE SIZE' ? 'OS' : size.replace(/[^A-Z0-9]/g, '')}`
      let sku = base
      for (let n = 2; ; n++) {
        const [clash] = await tx.select({ id: t.productVariants.id }).from(t.productVariants).where(eq(t.productVariants.sku, sku)).limit(1)
        if (!clash) break
        sku = `${base}-${n}`
      }
      const [variant] = await tx
        .insert(t.productVariants)
        .values({ productId: product.id, colorId: color.id, size, sku, stock: 0, sortOrder: maxSort + 1 + i })
        .returning({ id: t.productVariants.id })
      if (input.initialStock > 0) {
        await applyStockChange(tx, {
          variantId: variant.id,
          delta: input.initialStock,
          reason: 'initial',
          note: 'Шинэ хувилбарын анхны үлдэгдэл',
          actorUserId: ctx.actor.userId,
          actorLabel: actorLabel(ctx.actor),
        })
      }
      created.push(sku)
    }
    await audit(tx, ctx.actor, 'variant.created', { type: 'product', id: product.id }, { skus: created, initialStock: input.initialStock })
    return { created }
  })
}

export async function updateVariant(ctx: Ctx, raw: unknown) {
  const input = variantUpdateInput.parse(raw)
  const [variant] = await ctx.db.select().from(t.productVariants).where(eq(t.productVariants.id, input.variantId)).limit(1)
  if (!variant) throw ERR.notFound('Хувилбар')
  const [clash] = await ctx.db
    .select({ id: t.productVariants.id })
    .from(t.productVariants)
    .where(and(eq(t.productVariants.sku, input.sku), ne(t.productVariants.id, variant.id)))
    .limit(1)
  if (clash) throw new ServiceError('sku_taken', 'Энэ SKU өөр хувилбарт ашиглагдсан байна.', { sku: 'Давхардахгүй SKU оруулна уу.' })
  await ctx.db
    .update(t.productVariants)
    .set({ sku: input.sku, priceOverride: input.priceOverride, lowStockThreshold: input.lowStockThreshold, isActive: input.isActive })
    .where(eq(t.productVariants.id, variant.id))
  await audit(ctx.db, ctx.actor, 'variant.updated', { type: 'variant', id: variant.id }, {
    sku: input.sku,
    ...(variant.priceOverride !== input.priceOverride ? { priceBefore: variant.priceOverride, priceAfter: input.priceOverride } : {}),
    ...(variant.isActive !== input.isActive ? { active: input.isActive } : {}),
  })
  return { sku: input.sku }
}

const imageInput = z.object({
  productId: idSchema,
  colorId: idSchema.nullable(),
  url: z.url().refine((u) => u.startsWith('https://res.cloudinary.com/') || u.startsWith('/images/'), { error: 'Зургийн хаяг буруу.' }),
  alt: z.string().trim().min(2).max(200),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
})

export async function addImage(ctx: Ctx, raw: unknown) {
  const input = imageInput.parse(raw)
  const [{ maxSort }] = await ctx.db
    .select({ maxSort: sql<number>`coalesce(max(${t.productImages.sortOrder}), -1)::int` })
    .from(t.productImages)
    .where(eq(t.productImages.productId, input.productId))
  const [image] = await ctx.db
    .insert(t.productImages)
    .values({ ...input, sortOrder: maxSort + 1, credit: `Админ байршуулсан (${actorLabel(ctx.actor)})` })
    .returning({ id: t.productImages.id })
  await audit(ctx.db, ctx.actor, 'product.image_added', { type: 'product', id: input.productId })
  return { id: image.id }
}

export async function removeImage(ctx: Ctx, imageId: string) {
  idSchema.parse(imageId)
  const [image] = await ctx.db.delete(t.productImages).where(eq(t.productImages.id, imageId)).returning({ productId: t.productImages.productId })
  if (!image) throw ERR.notFound('Зураг')
  await audit(ctx.db, ctx.actor, 'product.image_removed', { type: 'product', id: image.productId })
}

export async function saveCategory(ctx: Ctx, raw: unknown) {
  const input = categoryInput.parse(raw)
  const values = { name: input.name, slug: input.slug, description: input.description, sortOrder: input.sortOrder, isActive: input.isActive }
  const [clash] = await ctx.db
    .select({ id: t.categories.id })
    .from(t.categories)
    .where(input.id ? and(eq(t.categories.slug, input.slug), ne(t.categories.id, input.id)) : eq(t.categories.slug, input.slug))
    .limit(1)
  if (clash) throw new ServiceError('slug_taken', 'Энэ вэб хаяг ашиглагдсан байна.', { slug: 'Өөр хаяг сонгоно уу.' })
  const id = input.id
    ? (await ctx.db.update(t.categories).set(values).where(eq(t.categories.id, input.id)).returning({ id: t.categories.id }))[0]?.id
    : (await ctx.db.insert(t.categories).values(values).returning({ id: t.categories.id }))[0].id
  if (!id) throw ERR.notFound('Ангилал')
  await audit(ctx.db, ctx.actor, 'category.saved', { type: 'category', id }, { name: input.name })
  return { id }
}

export async function saveCollection(ctx: Ctx, raw: unknown) {
  const input = collectionInput.parse(raw)
  const values = {
    name: input.name,
    slug: input.slug,
    eyebrow: input.eyebrow,
    description: input.description,
    sortOrder: input.sortOrder,
    isFeatured: input.isFeatured,
    isActive: input.isActive,
  }
  const [clash] = await ctx.db
    .select({ id: t.collections.id })
    .from(t.collections)
    .where(input.id ? and(eq(t.collections.slug, input.slug), ne(t.collections.id, input.id)) : eq(t.collections.slug, input.slug))
    .limit(1)
  if (clash) throw new ServiceError('slug_taken', 'Энэ вэб хаяг ашиглагдсан байна.', { slug: 'Өөр хаяг сонгоно уу.' })
  const id = input.id
    ? (await ctx.db.update(t.collections).set(values).where(eq(t.collections.id, input.id)).returning({ id: t.collections.id }))[0]?.id
    : (await ctx.db.insert(t.collections).values(values).returning({ id: t.collections.id }))[0].id
  if (!id) throw ERR.notFound('Цуглуулга')
  await audit(ctx.db, ctx.actor, 'collection.saved', { type: 'collection', id }, { name: input.name })
  return { id }
}

export async function saveShippingMethod(ctx: Ctx, raw: unknown) {
  const input = shippingMethodInput.parse(raw)
  const [row] = await ctx.db
    .update(t.shippingMethods)
    .set({ name: input.name, description: input.description, fee: input.fee, freeThreshold: input.freeThreshold, eta: input.eta, isActive: input.isActive })
    .where(eq(t.shippingMethods.id, input.id))
    .returning({ id: t.shippingMethods.id, code: t.shippingMethods.code })
  if (!row) throw ERR.notFound('Хүргэлтийн хэлбэр')
  if (!input.isActive) {
    const [{ n }] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(t.shippingMethods).where(eq(t.shippingMethods.isActive, true))
    if (n === 0) {
      await ctx.db.update(t.shippingMethods).set({ isActive: true }).where(eq(t.shippingMethods.id, input.id))
      throw new ServiceError('last_method', 'Дор хаяж нэг хүргэлтийн хэлбэр идэвхтэй байх ёстой.')
    }
  }
  await audit(ctx.db, ctx.actor, 'shipping.updated', { type: 'shipping', id: row.id }, { code: row.code, fee: input.fee, freeThreshold: input.freeThreshold })
}

export async function saveStoreInfo(ctx: Ctx, raw: unknown) {
  const input = storeInfoInput.parse(raw)
  await ctx.db
    .insert(t.settings)
    .values({ key: 'store', value: input, updatedBy: ctx.actor.userId })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: input, updatedBy: ctx.actor.userId } })
  await audit(ctx.db, ctx.actor, 'settings.updated', { type: 'settings', id: 'store' })
}

export async function savePolicy(ctx: Ctx, raw: unknown) {
  const input = policyInput.parse(raw)
  const policies: Policies = await loadPolicies(ctx.db)
  const next = { ...policies, [input.key]: { title: input.title, body: input.body } }
  await ctx.db
    .insert(t.settings)
    .values({ key: 'policies', value: next, updatedBy: ctx.actor.userId })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: next, updatedBy: ctx.actor.userId } })
  await audit(ctx.db, ctx.actor, 'policy.updated', { type: 'policy', id: input.key })
}

/** Archive (soft delete): hidden from the store, kept for order history. */
export async function setProductStatus(ctx: Ctx, productIds: string[], status: 'draft' | 'active' | 'archived') {
  const ids = z.array(idSchema).min(1).max(100).parse(productIds)
  if (status === 'active') {
    const withVariants = await ctx.db
      .selectDistinct({ productId: t.productVariants.productId })
      .from(t.productVariants)
      .where(and(inArray(t.productVariants.productId, ids), eq(t.productVariants.isActive, true)))
    if (withVariants.length !== ids.length) throw new ServiceError('no_variants', 'Хувилбаргүй барааг нийтлэх боломжгүй.')
  }
  await ctx.db
    .update(t.products)
    .set({ status, ...(status === 'active' ? { publishedAt: sql`coalesce(${t.products.publishedAt}, now())` } : {}) })
    .where(inArray(t.products.id, ids))
  for (const id of ids) await audit(ctx.db, ctx.actor, 'product.status_changed', { type: 'product', id }, { status })
}
