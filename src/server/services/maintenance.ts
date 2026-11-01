// Daily housekeeping for the public demo (Vercel Cron → /api/cron/maintenance):
//  1. cancel visitor demo orders left open > 48 h, returning their stock
//  2. top variants back up to their seeded baseline after visitor orders
//  3. anonymise visitor-entered personal details after 30 days
//  4. prune expired carts and old rate-limit windows
// Sample orders (source "seed") and the owner's own changes are never touched.
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { ServiceError, type ServiceContext } from '@/server/context'
import * as t from '@/server/db/schema'
import { pruneRateLimits } from '@/server/security/rate-limit'
import { PRODUCTS } from '@/server/seed/catalog-data'
import { applyStockChange } from './inventory'

const OPEN = ['pending', 'confirmed', 'processing'] as const

export interface MaintenanceReport {
  cancelled: number
  unitsReturned: number
  restockedVariants: number
  anonymisedOrders: number
  deletedCarts: number
}

/** Seeded stock per SKU — the demo's intended shelf. */
function seededBaseline(): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of PRODUCTS) {
    for (const color of p.colors) {
      p.sizes.forEach((size, i) => {
        const colorPart = color.code
          .split('-')
          .map((s) => s.slice(0, 3))
          .join('')
          .toUpperCase()
          .slice(0, 6)
        map.set(`MN-${p.code}-${colorPart}-${size === 'ONE SIZE' ? 'OS' : size.replace(/\s+/g, '')}`, p.stock[color.code][i])
      })
    }
  }
  return map
}

export async function runDemoMaintenance(ctx: ServiceContext): Promise<MaintenanceReport> {
  if (ctx.actor) throw new ServiceError('forbidden', 'Maintenance runs as the system only.')
  const report: MaintenanceReport = { cancelled: 0, unitsReturned: 0, restockedVariants: 0, anonymisedOrders: 0, deletedCarts: 0 }
  const stale = new Date(ctx.now.getTime() - 48 * 3_600_000)

  // 1. Abandoned visitor orders.
  const abandoned = await ctx.db
    .select({ id: t.orders.id })
    .from(t.orders)
    .where(and(eq(t.orders.source, 'storefront'), inArray(t.orders.status, [...OPEN]), lt(t.orders.placedAt, stale)))
    .limit(200)
  for (const { id } of abandoned) {
    await ctx.db.transaction(async (tx) => {
      const [order] = await tx.select().from(t.orders).where(eq(t.orders.id, id)).for('update')
      if (!order || !(OPEN as readonly string[]).includes(order.status)) return
      const items = await tx.select().from(t.orderItems).where(eq(t.orderItems.orderId, id))
      for (const item of items) {
        if (!item.variantId) continue
        await applyStockChange(tx, { variantId: item.variantId, delta: item.quantity, reason: 'order_cancelled', orderId: id, actorLabel: 'Систем', note: 'Демо захиалга 48 цагийн дараа автоматаар цуцлагдсан' })
        report.unitsReturned += item.quantity
      }
      await tx.update(t.orders).set({ status: 'cancelled', cancelledAt: ctx.now, cancelReason: 'Демо захиалга 48 цагийн дараа автоматаар цуцлагдсан.' }).where(eq(t.orders.id, id))
      await tx.insert(t.orderEvents).values({ orderId: id, fromStatus: order.status, toStatus: 'cancelled', note: 'Демо захиалга 48 цагийн дараа автоматаар цуцлагдсан. Бараа агуулахад буцсан.', actorLabel: 'Систем' })
      report.cancelled++
    })
  }

  // 2. Restore the demo shelf where completed visitor orders drew it down. Units still
  //    reserved by open orders count as on the shelf, so nothing is ever double-counted.
  const baseline = seededBaseline()
  const variants = await ctx.db.select({ id: t.productVariants.id, sku: t.productVariants.sku, stock: t.productVariants.stock }).from(t.productVariants).where(eq(t.productVariants.isActive, true))
  const reservedRows = await ctx.db
    .select({ variantId: t.orderItems.variantId, units: sql<number>`sum(${t.orderItems.quantity})::int` })
    .from(t.orderItems)
    .innerJoin(t.orders, eq(t.orders.id, t.orderItems.orderId))
    .where(inArray(t.orders.status, [...OPEN]))
    .groupBy(t.orderItems.variantId)
  const reserved = new Map(reservedRows.map((r) => [r.variantId, r.units]))
  for (const v of variants) {
    const target = baseline.get(v.sku)
    const effective = v.stock + (reserved.get(v.id) ?? 0)
    if (target === undefined || effective >= target) continue
    await ctx.db.transaction((tx) =>
      applyStockChange(tx, { variantId: v.id, delta: target - effective, reason: 'restock', actorLabel: 'Систем', note: 'Демо: өдөр тутмын нөхөн дүүргэлт' }),
    )
    report.restockedVariants++
  }

  // 3. Personal details typed by visitors are kept 30 days.
  const retention = new Date(ctx.now.getTime() - 30 * 86_400_000)
  const anonymised = await ctx.db
    .update(t.orders)
    .set({ customerName: 'Демо зочин', customerPhone: '00000000', customerEmail: null, address: 'Устгасан (30 хоног)', deliveryNote: null })
    .where(and(eq(t.orders.source, 'storefront'), lt(t.orders.placedAt, retention), sql`${t.orders.customerName} <> 'Демо зочин'`))
    .returning({ id: t.orders.id })
  report.anonymisedOrders = anonymised.length
  await ctx.db
    .update(t.customers)
    .set({ name: 'Демо зочин', phone: sql`'0000' || substr(md5(${t.customers.id}::text), 1, 4)`, email: null })
    .where(and(isNotNull(t.customers.visitorId), lt(t.customers.createdAt, retention), sql`${t.customers.name} <> 'Демо зочин'`))

  // 4. Housekeeping.
  const carts = await ctx.db.delete(t.carts).where(lt(t.carts.expiresAt, ctx.now)).returning({ id: t.carts.id })
  report.deletedCarts = carts.length
  await pruneRateLimits(ctx.db)
  await ctx.db.delete(t.sessions).where(lt(t.sessions.expiresAt, ctx.now))
  return report
}
