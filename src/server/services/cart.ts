// Database-backed cart, one per browser (keyed by the hashed visitor id).
// Lines hold only a variant and a quantity; prices and stock are always read
// fresh from the catalogue, so the browser can never set a price.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { MAX_LINE_QUANTITY, sizeLabel, variantAvailability, type Availability } from '@/lib/catalog'
import { variantPrice } from '@/lib/money'
import { addToCartInput, updateCartInput } from '@/lib/validation/store'
import { ServiceError } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'

const CART_DAYS = 30

export interface CartLine {
  itemId: string
  variantId: string
  productId: string
  productSlug: string
  productName: string
  colorName: string
  colorHex: string
  size: string
  sizeLabel: string
  sku: string
  imageUrl: string | null
  imageAlt: string
  unitPrice: number
  quantity: number
  lineTotal: number
  stock: number
  availability: Availability
  /** Set when the line can't be ordered as is (sold out, too many, unpublished). */
  problem: string | null
}

export interface CartView {
  lines: CartLine[]
  itemCount: number
  subtotal: number
  hasProblems: boolean
}

const EMPTY: CartView = { lines: [], itemCount: 0, subtotal: 0, hasProblems: false }

async function findCartId(db: Database, visitorKey: string): Promise<string | null> {
  const [cart] = await db.select({ id: t.carts.id }).from(t.carts).where(eq(t.carts.tokenHash, visitorKey)).limit(1)
  return cart?.id ?? null
}

async function getOrCreateCartId(db: Database, visitorKey: string, now: Date): Promise<string> {
  const expiresAt = new Date(now.getTime() + CART_DAYS * 86_400_000)
  const [row] = await db
    .insert(t.carts)
    .values({ tokenHash: visitorKey, visitorId: visitorKey, expiresAt })
    .onConflictDoUpdate({ target: t.carts.tokenHash, set: { expiresAt, updatedAt: now } })
    .returning({ id: t.carts.id })
  return row.id
}

/** Reads a cart with current prices and stock. */
export async function getCartView(db: Database, visitorKey: string | null): Promise<CartView> {
  if (!visitorKey) return EMPTY
  const cartId = await findCartId(db, visitorKey)
  if (!cartId) return EMPTY
  const rows = await db
    .select({
      itemId: t.cartItems.id,
      quantity: t.cartItems.quantity,
      variantId: t.productVariants.id,
      size: t.productVariants.size,
      sku: t.productVariants.sku,
      priceOverride: t.productVariants.priceOverride,
      stock: t.productVariants.stock,
      lowStockThreshold: t.productVariants.lowStockThreshold,
      variantActive: t.productVariants.isActive,
      colorId: t.productColors.id,
      colorName: t.productColors.name,
      colorHex: t.productColors.hex,
      productId: t.products.id,
      productSlug: t.products.slug,
      productName: t.products.name,
      productStatus: t.products.status,
      basePrice: t.products.basePrice,
    })
    .from(t.cartItems)
    .innerJoin(t.productVariants, eq(t.productVariants.id, t.cartItems.variantId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .where(eq(t.cartItems.cartId, cartId))
    .orderBy(asc(t.cartItems.createdAt))
  if (rows.length === 0) return EMPTY

  const images = await db
    .select({ productId: t.productImages.productId, colorId: t.productImages.colorId, url: t.productImages.url, alt: t.productImages.alt })
    .from(t.productImages)
    .where(inArray(t.productImages.productId, [...new Set(rows.map((r) => r.productId))]))
    .orderBy(asc(t.productImages.sortOrder))

  const lines: CartLine[] = rows.map((r) => {
    const image = images.find((i) => i.productId === r.productId && i.colorId === r.colorId) ?? images.find((i) => i.productId === r.productId)
    const unitPrice = variantPrice(r.basePrice, r.priceOverride)
    const isActive = r.variantActive && r.productStatus === 'active'
    const availability = variantAvailability({ stock: r.stock, lowStockThreshold: r.lowStockThreshold, isActive })
    let problem: string | null = null
    if (!isActive) problem = 'Энэ бараа одоогоор худалдаанд байхгүй.'
    else if (r.stock <= 0) problem = 'Энэ хэмжээ, өнгө дууссан байна.'
    else if (r.quantity > r.stock) problem = `Үлдэгдэл ${r.stock} ширхэг байна. Тоо ширхэгээ багасгана уу.`
    return {
      itemId: r.itemId,
      variantId: r.variantId,
      productId: r.productId,
      productSlug: r.productSlug,
      productName: r.productName,
      colorName: r.colorName,
      colorHex: r.colorHex,
      size: r.size,
      sizeLabel: sizeLabel(r.size),
      sku: r.sku,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? r.productName,
      unitPrice,
      quantity: r.quantity,
      lineTotal: unitPrice * r.quantity,
      stock: r.stock,
      availability,
      problem,
    }
  })
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.lineTotal, 0),
    hasProblems: lines.some((l) => l.problem !== null),
  }
}

/** Item count for the header badge. */
export async function getCartCount(db: Database, visitorKey: string | null): Promise<number> {
  if (!visitorKey) return 0
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${t.cartItems.quantity}), 0)::int` })
    .from(t.cartItems)
    .innerJoin(t.carts, eq(t.carts.id, t.cartItems.cartId))
    .where(eq(t.carts.tokenHash, visitorKey))
  return row?.n ?? 0
}

async function loadSellableVariant(db: Database, variantId: string) {
  const [v] = await db
    .select({
      id: t.productVariants.id,
      stock: t.productVariants.stock,
      isActive: t.productVariants.isActive,
      productStatus: t.products.status,
      productName: t.products.name,
      size: t.productVariants.size,
    })
    .from(t.productVariants)
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .where(eq(t.productVariants.id, variantId))
    .limit(1)
  if (!v || !v.isActive || v.productStatus !== 'active') throw new ServiceError('unavailable', 'Энэ бараа одоогоор худалдаанд байхгүй.')
  return v
}

function stockMessage(stock: number, inCart: number): string {
  if (stock <= 0) return 'Уучлаарай, энэ хэмжээ, өнгө дууссан байна.'
  if (inCart > 0) return `Үлдэгдэл ${stock} ширхэг бөгөөд таны сагсанд аль хэдийн ${inCart} байна.`
  return `Үлдэгдэл ${stock} ширхэг л байна.`
}

export async function addToCart(db: Database, visitorKey: string, raw: unknown, now = new Date()) {
  const input = addToCartInput.parse(raw)
  const variant = await loadSellableVariant(db, input.variantId)
  const cartId = await getOrCreateCartId(db, visitorKey, now)
  const [existing] = await db
    .select({ id: t.cartItems.id, quantity: t.cartItems.quantity })
    .from(t.cartItems)
    .where(and(eq(t.cartItems.cartId, cartId), eq(t.cartItems.variantId, variant.id)))
    .limit(1)
  const inCart = existing?.quantity ?? 0
  const wanted = inCart + input.quantity
  if (wanted > MAX_LINE_QUANTITY) throw new ServiceError('too_many', `Нэг бараанаас хамгийн ихдээ ${MAX_LINE_QUANTITY} ширхэг захиална.`)
  if (wanted > variant.stock) throw new ServiceError('insufficient_stock', stockMessage(variant.stock, inCart))
  if (existing) {
    await db.update(t.cartItems).set({ quantity: wanted, updatedAt: now }).where(eq(t.cartItems.id, existing.id))
  } else {
    await db.insert(t.cartItems).values({ cartId, variantId: variant.id, quantity: input.quantity })
  }
  return { quantity: wanted, productName: variant.productName, size: variant.size }
}

export async function updateCartItem(db: Database, visitorKey: string, raw: unknown, now = new Date()) {
  const input = updateCartInput.parse(raw)
  const cartId = await findCartId(db, visitorKey)
  if (!cartId) throw new ServiceError('not_found', 'Сагс олдсонгүй.')
  const [item] = await db
    .select({ id: t.cartItems.id, variantId: t.cartItems.variantId })
    .from(t.cartItems)
    .where(and(eq(t.cartItems.id, input.itemId), eq(t.cartItems.cartId, cartId)))
    .limit(1)
  if (!item) throw new ServiceError('not_found', 'Сагсанд ийм бараа алга.')
  if (input.quantity === 0) {
    await db.delete(t.cartItems).where(eq(t.cartItems.id, item.id))
    return { quantity: 0 }
  }
  const [variant] = await db
    .select({ stock: t.productVariants.stock })
    .from(t.productVariants)
    .where(eq(t.productVariants.id, item.variantId))
    .limit(1)
  if (!variant || input.quantity > variant.stock) {
    throw new ServiceError('insufficient_stock', stockMessage(variant?.stock ?? 0, 0))
  }
  await db.update(t.cartItems).set({ quantity: input.quantity, updatedAt: now }).where(eq(t.cartItems.id, item.id))
  return { quantity: input.quantity }
}

export async function clearCart(db: Database, visitorKey: string) {
  const cartId = await findCartId(db, visitorKey)
  if (cartId) await db.delete(t.cartItems).where(eq(t.cartItems.cartId, cartId))
}
