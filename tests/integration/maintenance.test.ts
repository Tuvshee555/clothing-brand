import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as t from '@/server/db/schema'
import { addToCart } from '@/server/services/cart'
import { placeOrder } from '@/server/services/checkout'
import { runDemoMaintenance } from '@/server/services/maintenance'
import { checkoutDetails, createTestDb, ctx, stockOf, variant, visitor, type TestDb } from './helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

describe('demo maintenance', () => {
  it('cancels abandoned visitor orders, restores the shelf and anonymises old details', async () => {
    const tee = await variant(db, 'essential-cotton-tee', 'black', 'S')
    const v = visitor()
    await addToCart(db, v, { variantId: tee.id, quantity: 2 })
    const placed = await placeOrder(ctx(db), v, checkoutDetails)
    expect(await stockOf(db, tee.id)).toBe(tee.stock - 2)

    // Fresh orders are left alone.
    let report = await runDemoMaintenance({ db, actor: null, now: new Date() })
    expect(report.cancelled).toBe(0)
    let [order] = await db.select().from(t.orders).where(eq(t.orders.number, placed.number))
    expect(order.status).toBe('pending')

    // Three days later: cancelled, stock returned, sample orders untouched.
    report = await runDemoMaintenance({ db, actor: null, now: new Date(Date.now() + 72 * 3_600_000) })
    expect(report.cancelled).toBe(1)
    expect(report.unitsReturned).toBe(2)
    ;[order] = await db.select().from(t.orders).where(eq(t.orders.number, placed.number))
    expect(order.status).toBe('cancelled')
    expect(await stockOf(db, tee.id)).toBe(tee.stock)
    const [sample] = await db.select().from(t.orders).where(eq(t.orders.number, 'MN-09013'))
    expect(sample.status).toBe('pending')

    // A month later the visitor's details are gone, the order numbers remain.
    report = await runDemoMaintenance({ db, actor: null, now: new Date(Date.now() + 31 * 86_400_000) })
    ;[order] = await db.select().from(t.orders).where(eq(t.orders.number, placed.number))
    expect(order.customerName).toBe('Демо зочин')
    expect(order.customerPhone).toBe('00000000')
    expect(order.total).toBeGreaterThan(0)
  })

  it('tops variants back up to the seeded shelf after visitor purchases', async () => {
    const coat = await variant(db, 'double-faced-wool-coat', 'black', 'S')
    const v = visitor()
    await addToCart(db, v, { variantId: coat.id, quantity: 1 })
    await placeOrder(ctx(db), v, checkoutDetails)
    const [o] = await db.select().from(t.orders).where(eq(t.orders.visitorId, v))
    await db.update(t.orders).set({ status: 'delivered' }).where(eq(t.orders.id, o.id))
    expect(await stockOf(db, coat.id)).toBe(coat.stock - 1)
    const report = await runDemoMaintenance({ db, actor: null, now: new Date() })
    expect(report.restockedVariants).toBeGreaterThanOrEqual(1)
    expect(await stockOf(db, coat.id)).toBe(coat.stock)
  })
})
