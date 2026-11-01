// Variant-level stock. Every change goes through applyStockChange(), which
// updates the variant atomically (never below zero) and writes the ledger row in
// the same transaction. The storefront never changes stock directly.
import { and, eq, sql } from 'drizzle-orm'
import type { StockReason } from '@/lib/inventory'
import { stockAdjustInput } from '@/lib/validation/admin'
import { actorLabel, audit } from '@/server/audit'
import { ServiceError, type Actor, type ServiceContext } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'

export type InventoryReason = (typeof t.inventoryReason.enumValues)[number]

export interface StockChange {
  variantId: string
  delta: number
  reason: InventoryReason
  note?: string | null
  orderId?: string | null
  actorUserId?: string | null
  actorLabel: string
}

/**
 * Applies a stock delta inside the caller's transaction. Fails (and so rolls the
 * whole transaction back) if the result would be negative.
 */
export async function applyStockChange(tx: Database, change: StockChange): Promise<number> {
  if (!Number.isInteger(change.delta) || change.delta === 0) throw new Error('stock delta must be a non-zero integer')
  const [row] = await tx
    .update(t.productVariants)
    .set({ stock: sql`${t.productVariants.stock} + ${change.delta}`, updatedAt: new Date() })
    .where(and(eq(t.productVariants.id, change.variantId), sql`${t.productVariants.stock} + ${change.delta} >= 0`))
    .returning({ stock: t.productVariants.stock })
  if (!row) {
    throw new ServiceError('insufficient_stock', 'Үлдэгдэл хүрэлцэхгүй байна.')
  }
  await tx.insert(t.inventoryTransactions).values({
    variantId: change.variantId,
    delta: change.delta,
    stockAfter: row.stock,
    reason: change.reason,
    note: change.note ?? null,
    orderId: change.orderId ?? null,
    actorUserId: change.actorUserId ?? null,
    actorLabel: change.actorLabel,
  })
  return row.stock
}

/** Admin stock adjustment: set an exact count or add/remove units, always with a reason. */
export async function adjustStock(ctx: ServiceContext & { actor: Actor }, raw: unknown) {
  const input = stockAdjustInput.parse(raw)
  return ctx.db.transaction(async (tx) => {
    const [variant] = await tx
      .select({ id: t.productVariants.id, stock: t.productVariants.stock, sku: t.productVariants.sku })
      .from(t.productVariants)
      .where(eq(t.productVariants.id, input.variantId))
      .for('update')
    if (!variant) throw new ServiceError('not_found', 'Хувилбар олдсонгүй.')
    const delta = input.mode === 'set' ? input.value - variant.stock : input.value
    if (delta === 0) throw new ServiceError('no_change', 'Үлдэгдэл өөрчлөгдөөгүй байна.', { value: 'Өмнөхтэй ижил тоо байна.' })
    if (variant.stock + delta < 0) {
      throw new ServiceError('insufficient_stock', `Үлдэгдэл ${variant.stock} ширхэг тул ${Math.abs(delta)}-ийг хасах боломжгүй.`, {
        value: 'Үлдэгдлээс их хасаж болохгүй.',
      })
    }
    const stockAfter = await applyStockChange(tx, {
      variantId: variant.id,
      delta,
      reason: input.reason satisfies StockReason,
      note: input.note,
      actorUserId: ctx.actor.userId,
      actorLabel: actorLabel(ctx.actor),
    })
    await audit(tx, ctx.actor, 'stock.adjusted', { type: 'variant', id: variant.id }, {
      sku: variant.sku,
      before: variant.stock,
      after: stockAfter,
      reason: input.reason,
    })
    return { sku: variant.sku, before: variant.stock, after: stockAfter }
  })
}
