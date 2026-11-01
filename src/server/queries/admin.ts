// Admin read models. Every query that returns orders or customers is scoped by
// the actor: the public demo sees the sample data plus what its own browser
// created — never another visitor's details.
import 'server-only'
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { compareSizes, variantAvailability } from '@/lib/catalog'
import type { OrderStatus } from '@/lib/orders'
import type { Actor } from '@/server/context'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { loadPolicies, loadShippingMethods, loadStoreInfo } from './settings'

/** Orders this actor may see. */
export function orderScope(actor: Actor): SQL | undefined {
  if (actor.role !== 'demo') return undefined
  return or(eq(t.orders.source, 'seed'), actor.visitorKey ? eq(t.orders.visitorId, actor.visitorKey) : sql`false`)
}

function customerScope(actor: Actor): SQL | undefined {
  if (actor.role !== 'demo') return undefined
  return or(isNull(t.customers.visitorId), actor.visitorKey ? eq(t.customers.visitorId, actor.visitorKey) : sql`false`)
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard(actor: Actor) {
  const scope = orderScope(actor)
  const [totals] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${t.orders.total}) filter (where ${t.orders.status} <> 'cancelled'), 0)::int`,
      pending: sql<number>`count(*) filter (where ${t.orders.status} = 'pending')::int`,
      open: sql<number>`count(*) filter (where ${t.orders.status} in ('confirmed','processing','shipped'))::int`,
      delivered: sql<number>`count(*) filter (where ${t.orders.status} = 'delivered')::int`,
      cancelled: sql<number>`count(*) filter (where ${t.orders.status} = 'cancelled')::int`,
      units: sql<number>`coalesce(sum(${t.orders.itemCount}) filter (where ${t.orders.status} <> 'cancelled'), 0)::int`,
    })
    .from(t.orders)
    .where(scope)

  const [products] = await db
    .select({
      active: sql<number>`count(*) filter (where ${t.products.status} = 'active')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(t.products)

  const [stock] = await db
    .select({
      low: sql<number>`count(*) filter (where ${t.productVariants.isActive} and ${t.productVariants.stock} > 0 and ${t.productVariants.stock} <= ${t.productVariants.lowStockThreshold})::int`,
      out: sql<number>`count(*) filter (where ${t.productVariants.isActive} and ${t.productVariants.stock} = 0)::int`,
      units: sql<number>`coalesce(sum(${t.productVariants.stock}) filter (where ${t.productVariants.isActive}), 0)::int`,
      variants: sql<number>`count(*)::int`,
    })
    .from(t.productVariants)
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .where(ne(t.products.status, 'archived'))

  // Last 14 days in Ulaanbaatar time.
  const daily = await db
    .select({
      day: sql<string>`to_char((${t.orders.placedAt} at time zone 'Asia/Ulaanbaatar')::date, 'YYYY-MM-DD')`,
      orders: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${t.orders.total}) filter (where ${t.orders.status} <> 'cancelled'), 0)::int`,
    })
    .from(t.orders)
    .where(and(scope, gte(t.orders.placedAt, sql`now() - interval '14 days'`)))
    .groupBy(sql`1`)
    .orderBy(sql`1`)

  const topProducts = await db
    .select({
      name: t.orderItems.productName,
      slug: t.orderItems.productSlug,
      units: sql<number>`sum(${t.orderItems.quantity})::int`,
      revenue: sql<number>`sum(${t.orderItems.lineTotal})::int`,
    })
    .from(t.orderItems)
    .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
    .where(and(scope, ne(t.orders.status, 'cancelled')))
    .groupBy(t.orderItems.productName, t.orderItems.productSlug)
    .orderBy(desc(sql`sum(${t.orderItems.quantity})`))
    .limit(5)

  const recentOrders = await db
    .select({
      id: t.orders.id,
      number: t.orders.number,
      customerName: t.orders.customerName,
      total: t.orders.total,
      status: t.orders.status,
      paymentStatus: t.orders.paymentStatus,
      placedAt: t.orders.placedAt,
      source: t.orders.source,
    })
    .from(t.orders)
    .where(scope)
    .orderBy(desc(t.orders.placedAt))
    .limit(6)

  const lowStock = await db
    .select({
      variantId: t.productVariants.id,
      productId: t.products.id,
      productName: t.products.name,
      colorName: t.productColors.name,
      size: t.productVariants.size,
      stock: t.productVariants.stock,
      threshold: t.productVariants.lowStockThreshold,
    })
    .from(t.productVariants)
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .where(and(eq(t.productVariants.isActive, true), eq(t.products.status, 'active'), lte(t.productVariants.stock, t.productVariants.lowStockThreshold)))
    .orderBy(asc(t.productVariants.stock), asc(t.products.name))
    .limit(8)

  const events = await db
    .select({
      id: t.orderEvents.id,
      orderId: t.orderEvents.orderId,
      number: t.orders.number,
      toStatus: t.orderEvents.toStatus,
      actorLabel: t.orderEvents.actorLabel,
      createdAt: t.orderEvents.createdAt,
    })
    .from(t.orderEvents)
    .innerJoin(t.orders, eq(t.orders.id, t.orderEvents.orderId))
    .where(scope)
    .orderBy(desc(t.orderEvents.createdAt))
    .limit(8)

  const stockMoves = await db
    .select({
      id: t.inventoryTransactions.id,
      delta: t.inventoryTransactions.delta,
      reason: t.inventoryTransactions.reason,
      actorLabel: t.inventoryTransactions.actorLabel,
      createdAt: t.inventoryTransactions.createdAt,
      productName: t.products.name,
      size: t.productVariants.size,
      colorName: t.productColors.name,
    })
    .from(t.inventoryTransactions)
    .innerJoin(t.productVariants, eq(t.productVariants.id, t.inventoryTransactions.variantId))
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .where(ne(t.inventoryTransactions.reason, 'initial'))
    .orderBy(desc(t.inventoryTransactions.createdAt))
    .limit(6)

  return { totals, products, stock, daily, topProducts, recentOrders, lowStock, events, stockMoves }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function listOrders(actor: Actor, f: { q?: string; status?: string; payment?: string; page?: number }) {
  const conds: (SQL | undefined)[] = [orderScope(actor)]
  if (f.status && f.status !== 'all') conds.push(eq(t.orders.status, f.status as OrderStatus))
  if (f.payment && ['unpaid', 'simulated', 'paid', 'refunded'].includes(f.payment)) conds.push(eq(t.orders.paymentStatus, f.payment as 'unpaid'))
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`
    conds.push(or(ilike(t.orders.number, like), ilike(t.orders.customerName, like), ilike(t.orders.customerPhone, like)))
  }
  const where = and(...conds)
  const page = Math.max(1, f.page ?? 1)
  const [rows, [count], statusCounts] = await Promise.all([
    db
      .select({
        id: t.orders.id,
        number: t.orders.number,
        customerName: t.orders.customerName,
        customerPhone: t.orders.customerPhone,
        itemCount: t.orders.itemCount,
        total: t.orders.total,
        status: t.orders.status,
        paymentStatus: t.orders.paymentStatus,
        paymentMethod: t.orders.paymentMethod,
        district: t.orders.district,
        placedAt: t.orders.placedAt,
        source: t.orders.source,
        visitorId: t.orders.visitorId,
      })
      .from(t.orders)
      .where(where)
      .orderBy(desc(t.orders.placedAt))
      .limit(30)
      .offset((page - 1) * 30),
    db.select({ n: sql<number>`count(*)::int` }).from(t.orders).where(where),
    db
      .select({ status: t.orders.status, n: sql<number>`count(*)::int` })
      .from(t.orders)
      .where(orderScope(actor))
      .groupBy(t.orders.status),
  ])
  return { rows, total: count?.n ?? 0, page, pages: Math.max(1, Math.ceil((count?.n ?? 0) / 30)), statusCounts }
}

export async function getOrderDetail(actor: Actor, id: string) {
  const [order] = await db
    .select()
    .from(t.orders)
    .where(and(eq(t.orders.id, id), orderScope(actor)))
    .limit(1)
  if (!order) return null
  const [items, events, payments, stockMoves] = await Promise.all([
    db
      .select({
        id: t.orderItems.id,
        productId: t.orderItems.productId,
        variantId: t.orderItems.variantId,
        productName: t.orderItems.productName,
        productSlug: t.orderItems.productSlug,
        colorName: t.orderItems.colorName,
        size: t.orderItems.size,
        sku: t.orderItems.sku,
        imageUrl: t.orderItems.imageUrl,
        unitPrice: t.orderItems.unitPrice,
        quantity: t.orderItems.quantity,
        lineTotal: t.orderItems.lineTotal,
        currentStock: t.productVariants.stock,
      })
      .from(t.orderItems)
      .leftJoin(t.productVariants, eq(t.productVariants.id, t.orderItems.variantId))
      .where(eq(t.orderItems.orderId, order.id)),
    db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, order.id)).orderBy(asc(t.orderEvents.createdAt)),
    db.select().from(t.payments).where(eq(t.payments.orderId, order.id)).orderBy(desc(t.payments.createdAt)),
    db
      .select({
        id: t.inventoryTransactions.id,
        delta: t.inventoryTransactions.delta,
        stockAfter: t.inventoryTransactions.stockAfter,
        reason: t.inventoryTransactions.reason,
        createdAt: t.inventoryTransactions.createdAt,
        sku: t.productVariants.sku,
      })
      .from(t.inventoryTransactions)
      .innerJoin(t.productVariants, eq(t.productVariants.id, t.inventoryTransactions.variantId))
      .where(eq(t.inventoryTransactions.orderId, order.id))
      .orderBy(asc(t.inventoryTransactions.createdAt)),
  ])
  return { order, items, events, payments, stockMoves }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function listProducts(f: { q?: string; category?: string; status?: string }) {
  const conds: (SQL | undefined)[] = []
  if (f.q) conds.push(ilike(t.products.name, `%${escapeLike(f.q)}%`))
  if (f.category) conds.push(eq(t.categories.slug, f.category))
  if (f.status && ['draft', 'active', 'archived'].includes(f.status)) conds.push(eq(t.products.status, f.status as 'active'))
  const rows = await db
    .select({
      id: t.products.id,
      slug: t.products.slug,
      name: t.products.name,
      status: t.products.status,
      basePrice: t.products.basePrice,
      isFeatured: t.products.isFeatured,
      isNewArrival: t.products.isNewArrival,
      categoryName: t.categories.name,
      updatedAt: t.products.updatedAt,
    })
    .from(t.products)
    .innerJoin(t.categories, eq(t.categories.id, t.products.categoryId))
    .where(and(...conds))
    .orderBy(asc(t.products.sortOrder), asc(t.products.name))
  const ids = rows.map((r) => r.id)
  const [variantStats, images] = ids.length
    ? await Promise.all([
        db
          .select({
            productId: t.productVariants.productId,
            variants: sql<number>`count(*)::int`,
            stock: sql<number>`coalesce(sum(${t.productVariants.stock}) filter (where ${t.productVariants.isActive}), 0)::int`,
            low: sql<number>`count(*) filter (where ${t.productVariants.isActive} and ${t.productVariants.stock} > 0 and ${t.productVariants.stock} <= ${t.productVariants.lowStockThreshold})::int`,
            out: sql<number>`count(*) filter (where ${t.productVariants.isActive} and ${t.productVariants.stock} = 0)::int`,
            minPrice: sql<number>`min(coalesce(${t.productVariants.priceOverride}, 0))::int`,
          })
          .from(t.productVariants)
          .where(inArray(t.productVariants.productId, ids))
          .groupBy(t.productVariants.productId),
        db
          .selectDistinctOn([t.productImages.productId], { productId: t.productImages.productId, url: t.productImages.url })
          .from(t.productImages)
          .where(inArray(t.productImages.productId, ids))
          .orderBy(t.productImages.productId, asc(t.productImages.sortOrder)),
      ])
    : [[], []]
  return rows.map((r) => ({
    ...r,
    stats: variantStats.find((v) => v.productId === r.id) ?? { variants: 0, stock: 0, low: 0, out: 0 },
    image: images.find((i) => i.productId === r.id)?.url ?? null,
  }))
}

export async function getProductForEdit(id: string) {
  const [product] = await db.select().from(t.products).where(eq(t.products.id, id)).limit(1)
  if (!product) return null
  const [colors, variants, images, links] = await Promise.all([
    db.select().from(t.productColors).where(eq(t.productColors.productId, id)).orderBy(asc(t.productColors.sortOrder)),
    db.select().from(t.productVariants).where(eq(t.productVariants.productId, id)).orderBy(asc(t.productVariants.sortOrder)),
    db.select().from(t.productImages).where(eq(t.productImages.productId, id)).orderBy(asc(t.productImages.sortOrder)),
    db.select({ collectionId: t.productCollections.collectionId }).from(t.productCollections).where(eq(t.productCollections.productId, id)),
  ])
  return {
    product,
    colors,
    variants: variants
      .map((v) => ({ ...v, availability: variantAvailability(v) }))
      .sort((a, b) => colors.findIndex((c) => c.id === a.colorId) - colors.findIndex((c) => c.id === b.colorId) || compareSizes(a.size, b.size)),
    images,
    collectionIds: links.map((l) => l.collectionId),
  }
}

export async function getCatalogOptions() {
  const [categories, collections] = await Promise.all([
    db.select().from(t.categories).orderBy(asc(t.categories.sortOrder)),
    db.select().from(t.collections).orderBy(asc(t.collections.sortOrder)),
  ])
  return { categories, collections }
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export async function listInventory(f: { q?: string; filter?: string }) {
  const conds: (SQL | undefined)[] = [ne(t.products.status, 'archived')]
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`
    conds.push(or(ilike(t.products.name, like), ilike(t.productVariants.sku, like)))
  }
  if (f.filter === 'low') conds.push(sql`${t.productVariants.stock} > 0 and ${t.productVariants.stock} <= ${t.productVariants.lowStockThreshold}`)
  if (f.filter === 'out') conds.push(eq(t.productVariants.stock, 0))
  return db
    .select({
      variantId: t.productVariants.id,
      sku: t.productVariants.sku,
      size: t.productVariants.size,
      stock: t.productVariants.stock,
      threshold: t.productVariants.lowStockThreshold,
      isActive: t.productVariants.isActive,
      productId: t.products.id,
      productName: t.products.name,
      productStatus: t.products.status,
      colorName: t.productColors.name,
      colorHex: t.productColors.hex,
    })
    .from(t.productVariants)
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .where(and(...conds))
    .orderBy(asc(t.products.sortOrder), asc(t.productColors.sortOrder), asc(t.productVariants.sortOrder))
}

export async function listInventoryHistory(actor: Actor, f: { variantId?: string; limit?: number }) {
  const scope = orderScope(actor)
  return db
    .select({
      id: t.inventoryTransactions.id,
      delta: t.inventoryTransactions.delta,
      stockAfter: t.inventoryTransactions.stockAfter,
      reason: t.inventoryTransactions.reason,
      note: t.inventoryTransactions.note,
      actorLabel: t.inventoryTransactions.actorLabel,
      createdAt: t.inventoryTransactions.createdAt,
      sku: t.productVariants.sku,
      size: t.productVariants.size,
      productName: t.products.name,
      colorName: t.productColors.name,
      orderId: t.orders.id,
      orderNumber: t.orders.number,
      orderVisible: scope ? sql<boolean>`${scope}` : sql<boolean>`true`,
    })
    .from(t.inventoryTransactions)
    .innerJoin(t.productVariants, eq(t.productVariants.id, t.inventoryTransactions.variantId))
    .innerJoin(t.products, eq(t.products.id, t.productVariants.productId))
    .innerJoin(t.productColors, eq(t.productColors.id, t.productVariants.colorId))
    .leftJoin(t.orders, eq(t.orders.id, t.inventoryTransactions.orderId))
    .where(f.variantId ? eq(t.inventoryTransactions.variantId, f.variantId) : undefined)
    .orderBy(desc(t.inventoryTransactions.createdAt))
    .limit(f.limit ?? 50)
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(actor: Actor, f: { q?: string }) {
  const conds: (SQL | undefined)[] = [customerScope(actor)]
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`
    conds.push(or(ilike(t.customers.name, like), ilike(t.customers.phone, like)))
  }
  return db
    .select({
      id: t.customers.id,
      name: t.customers.name,
      phone: t.customers.phone,
      email: t.customers.email,
      createdAt: t.customers.createdAt,
      isDemo: t.customers.isDemo,
      visitorId: t.customers.visitorId,
      orders: sql<number>`count(${t.orders.id})::int`,
      spent: sql<number>`coalesce(sum(${t.orders.total}) filter (where ${t.orders.status} <> 'cancelled'), 0)::int`,
      lastOrderAt: sql<Date | null>`max(${t.orders.placedAt})`,
    })
    .from(t.customers)
    .leftJoin(t.orders, eq(t.orders.customerId, t.customers.id))
    .where(and(...conds))
    .groupBy(t.customers.id)
    .orderBy(desc(sql`max(${t.orders.placedAt})`))
    .limit(100)
}

export async function getCustomer(actor: Actor, id: string) {
  const [customer] = await db
    .select()
    .from(t.customers)
    .where(and(eq(t.customers.id, id), customerScope(actor)))
    .limit(1)
  if (!customer) return null
  const orders = await db
    .select({
      id: t.orders.id,
      number: t.orders.number,
      total: t.orders.total,
      itemCount: t.orders.itemCount,
      status: t.orders.status,
      paymentStatus: t.orders.paymentStatus,
      placedAt: t.orders.placedAt,
      district: t.orders.district,
      address: t.orders.address,
    })
    .from(t.orders)
    .where(and(eq(t.orders.customerId, customer.id), orderScope(actor)))
    .orderBy(desc(t.orders.placedAt))
  return { customer, orders }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettingsData() {
  const [info, policies, shipping] = await Promise.all([loadStoreInfo(db), loadPolicies(db), loadShippingMethods(db, { activeOnly: false })])
  return { info, policies, shipping }
}
