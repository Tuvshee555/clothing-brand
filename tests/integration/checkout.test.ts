import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { ServiceError } from '@/server/context'
import * as t from '@/server/db/schema'
import { addToCart, getCartView } from '@/server/services/cart'
import { placeOrder } from '@/server/services/checkout'
import { checkoutDetails, createTestDb, ctx, stockOf, variant, visitor, type TestDb } from './helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

async function orderFor(number: string) {
  const [order] = await db.select().from(t.orders).where(eq(t.orders.number, number))
  const items = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id))
  return { order, items }
}

describe('checkout', () => {
  it('computes prices, delivery fee and total on the server and reserves stock', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'white', 'M')
    await addToCart(db, v, { variantId: tee.id, quantity: 2 })
    const placed = await placeOrder(ctx(db), v, checkoutDetails)
    const { order, items } = await orderFor(placed.number)
    expect(order.subtotal).toBe(178_000)
    expect(order.shippingFee).toBe(6_000) // below the 200,000₮ free-delivery threshold
    expect(order.total).toBe(184_000)
    expect(order.status).toBe('pending')
    expect(order.paymentStatus).toBe('unpaid')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ unitPrice: 89_000, quantity: 2, lineTotal: 178_000, sku: tee.sku, colorName: 'Цагаан', size: 'M' })
    expect(await stockOf(db, tee.id)).toBe(tee.stock - 2)
    const [tx] = await db
      .select()
      .from(t.inventoryTransactions)
      .where(and(eq(t.inventoryTransactions.variantId, tee.id), eq(t.inventoryTransactions.orderId, order.id)))
    expect(tx).toMatchObject({ delta: -2, reason: 'order_reserved', stockAfter: tee.stock - 2 })
    expect((await getCartView(db, v)).lines).toHaveLength(0)
  })

  it('ignores any price or total the browser sends', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'black', 'M')
    await addToCart(db, v, { variantId: tee.id, quantity: 1 })
    const placed = await placeOrder(ctx(db), v, { ...checkoutDetails, price: 1, total: 1, subtotal: 1, shippingFee: 0, unitPrice: 1 })
    const { order, items } = await orderFor(placed.number)
    expect(items[0].unitPrice).toBe(89_000)
    expect(order.total).toBe(95_000)
  })

  it('refuses the order when the total the visitor saw is out of date', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'black', 'L')
    await addToCart(db, v, { variantId: tee.id, quantity: 1 })
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(t.orders)
    const err = await placeOrder(ctx(db), v, { ...checkoutDetails, expectedTotal: 1 }).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceError)
    expect(err.code).toBe('total_changed')
    expect(err.details).toEqual({ total: 95_000 })
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(t.orders)
    expect(after[0].n).toBe(before[0].n)
    expect(await stockOf(db, tee.id)).toBe(tee.stock)
    expect((await getCartView(db, v)).lines).toHaveLength(1)
  })

  it('makes delivery free from 200,000₮ and uses variant price overrides', async () => {
    const v = visitor()
    const xxl = await variant(db, 'oversized-hoodie', 'latte', 'XXL')
    expect(xxl.priceOverride).toBe(229_000)
    await addToCart(db, v, { variantId: xxl.id, quantity: 1 })
    const placed = await placeOrder(ctx(db), v, checkoutDetails)
    const { order, items } = await orderFor(placed.number)
    expect(items[0].unitPrice).toBe(229_000)
    expect(order.shippingFee).toBe(0)
    expect(order.total).toBe(229_000)
  })

  it('never oversells the last unit when two customers check out at once', async () => {
    const last = await variant(db, 'long-leather-coat', 'black', 'XS')
    expect(last.stock).toBe(1)
    const [a, b] = [visitor(), visitor()]
    await addToCart(db, a, { variantId: last.id, quantity: 1 })
    await addToCart(db, b, { variantId: last.id, quantity: 1 })
    const results = await Promise.allSettled([placeOrder(ctx(db), a, checkoutDetails), placeOrder(ctx(db), b, checkoutDetails)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(ServiceError)
    expect(rejected.reason.code).toBe('stock_changed')
    expect(await stockOf(db, last.id)).toBe(0)
  })

  it('rejects invalid quantities and sold-out or over-stock requests', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'white', 'XXL')
    await expect(addToCart(db, v, { variantId: tee.id, quantity: 0 })).rejects.toBeInstanceOf(ZodError)
    await expect(addToCart(db, v, { variantId: tee.id, quantity: -1 })).rejects.toBeInstanceOf(ZodError)
    await expect(addToCart(db, v, { variantId: tee.id, quantity: 21 })).rejects.toBeInstanceOf(ZodError)
    await expect(addToCart(db, v, { variantId: tee.id, quantity: tee.stock + 1 })).rejects.toMatchObject({ code: 'insufficient_stock' })
    const soldOut = await variant(db, 'oversized-hoodie', 'black', 'S')
    expect(soldOut.stock).toBe(0)
    await expect(addToCart(db, v, { variantId: soldOut.id, quantity: 1 })).rejects.toMatchObject({ code: 'insufficient_stock' })
  })

  it('validates the delivery area against the chosen delivery method', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'ecru', 'M')
    await addToCart(db, v, { variantId: tee.id, quantity: 1 })
    const err = await placeOrder(ctx(db), v, { ...checkoutDetails, shippingMethod: 'countryside', district: 'Хан-Уул' }).catch((e) => e)
    expect(err).toBeInstanceOf(ServiceError)
    expect(err.fieldErrors).toHaveProperty('district')
  })

  it('requires the demo acknowledgement, valid phone and a non-empty cart', async () => {
    const v = visitor()
    await expect(placeOrder(ctx(db), v, checkoutDetails)).rejects.toMatchObject({ code: 'empty_cart' })
    await expect(placeOrder(ctx(db), v, { ...checkoutDetails, acceptDemo: false })).rejects.toBeInstanceOf(ZodError)
    await expect(placeOrder(ctx(db), v, { ...checkoutDetails, phone: '123' })).rejects.toBeInstanceOf(ZodError)
  })

  it('keeps the price a customer paid when the product price changes later', async () => {
    const v = visitor()
    const tee = await variant(db, 'essential-cotton-tee', 'white', 'S')
    await addToCart(db, v, { variantId: tee.id, quantity: 1 })
    const placed = await placeOrder(ctx(db), v, checkoutDetails)
    await db.update(t.products).set({ basePrice: 129_000 }).where(eq(t.products.slug, 'essential-cotton-tee'))
    const { items, order } = await orderFor(placed.number)
    expect(items[0].unitPrice).toBe(89_000)
    expect(order.total).toBe(95_000)
    await db.update(t.products).set({ basePrice: 89_000 }).where(eq(t.products.slug, 'essential-cotton-tee'))
  })
})
