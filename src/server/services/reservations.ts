// Reservation expiry for chat orders (the Lorentz pattern from
// server/jobs/expireOrders.js at 69e4110): an unpaid order the assistant created
// holds its stock until `expiresAt`; after that it is cancelled and its stock
// returned — once, whichever trigger gets there first (a new chat order of the
// same browser, the assistant's periodic sweep, the daily maintenance cron).
// Each order is claimed under a row lock and re-checked (compare-and-set).
import { and, asc, eq, isNotNull, lt, type SQL } from 'drizzle-orm'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { applyStockChange } from './inventory'

export const EXPIRY_NOTE = 'Чат захиалгын төлбөрийн хугацаа дууссан тул автоматаар цуцлагдсан. Бараа агуулахад буцсан.'

/** Unpaid, still-pending chat orders whose hold has ended. */
function dueOrders(now: Date, extra?: SQL) {
  return and(
    eq(t.orders.source, 'assistant'),
    eq(t.orders.status, 'pending'),
    eq(t.orders.paymentStatus, 'unpaid'),
    isNotNull(t.orders.expiresAt),
    lt(t.orders.expiresAt, now),
    extra,
  )
}

/** Units returned, or null when the order was no longer due. */
async function expireOne(tx: Database, orderId: string, now: Date): Promise<number | null> {
  const [order] = await tx.select().from(t.orders).where(eq(t.orders.id, orderId)).for('update')
  // Paid, cancelled or extended meanwhile: not ours to release.
  if (!order || order.status !== 'pending' || order.paymentStatus !== 'unpaid' || !order.expiresAt || order.expiresAt >= now) return null
  const items = await tx.select().from(t.orderItems).where(eq(t.orderItems.orderId, orderId))
  let units = 0
  for (const item of items) {
    if (!item.variantId) continue
    await applyStockChange(tx, { variantId: item.variantId, delta: item.quantity, reason: 'order_cancelled', orderId, actorLabel: 'Систем', note: 'Чат захиалгын хугацаа дууссан' })
    units += item.quantity
  }
  await tx.update(t.orders).set({ status: 'cancelled', cancelledAt: now, cancelReason: 'Төлбөрийн хугацаа дууссан (чат захиалга).' }).where(eq(t.orders.id, orderId))
  await tx.update(t.payments).set({ status: 'cancelled' }).where(and(eq(t.payments.orderId, orderId), eq(t.payments.status, 'pending')))
  await tx.insert(t.orderEvents).values({ orderId, fromStatus: 'pending', toStatus: 'cancelled', note: EXPIRY_NOTE, actorLabel: 'Систем' })
  return units
}

/**
 * Releases due chat orders. Inside a transaction (`inTx`), every claim joins it;
 * otherwise each order gets its own transaction so one failure cannot block the rest.
 */
export async function releaseExpiredChatOrders(
  db: Database,
  opts: { now?: Date; visitorKey?: string | null; limit?: number; inTx?: boolean } = {},
): Promise<{ cancelled: number; unitsReturned: number }> {
  const now = opts.now ?? new Date()
  const due = await db
    .select({ id: t.orders.id })
    .from(t.orders)
    .where(dueOrders(now, opts.visitorKey ? eq(t.orders.visitorId, opts.visitorKey) : undefined))
    .orderBy(asc(t.orders.expiresAt))
    .limit(opts.limit ?? 50)
  let cancelled = 0
  let unitsReturned = 0
  for (const { id } of due) {
    const units = opts.inTx ? await expireOne(db, id, now) : await db.transaction((tx) => expireOne(tx, id, now))
    if (units === null) continue
    cancelled++
    unitsReturned += units
  }
  return { cancelled, unitsReturned }
}
