import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ServiceError } from '@/server/context'
import * as t from '@/server/db/schema'
import { addToCart } from '@/server/services/cart'
import { placeOrder } from '@/server/services/checkout'
import { ensureQpayInvoice, findCustomerOrder, recordCashPayment, simulateQpayPayment, transitionOrder } from '@/server/services/orders'
import { checkoutDetails, createTestDb, ctx, demoActor, ownerActor, stockOf, variant, visitor, type TestDb } from './helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

async function newOrder(v: string, method: 'qpay' | 'cash_on_delivery' = 'qpay', slug = 'heavy-crewneck-sweatshirt', color = 'black', size = 'M') {
  const item = await variant(db, slug, color, size)
  await addToCart(db, v, { variantId: item.id, quantity: 1 })
  const placed = await placeOrder(ctx(db), v, { ...checkoutDetails, paymentMethod: method })
  const [order] = await db.select().from(t.orders).where(eq(t.orders.number, placed.number))
  return { order, item, placed }
}

describe('order lifecycle', () => {
  it('moves forward through the status machine and rejects skipped steps', async () => {
    const owner = await ownerActor(db)
    const { order } = await newOrder(visitor())
    await expect(transitionOrder({ ...ctx(db), actor: owner }, { orderId: order.id, to: 'delivered' })).rejects.toMatchObject({ code: 'invalid_transition' })
    for (const to of ['confirmed', 'processing', 'shipped', 'delivered'] as const) {
      await transitionOrder({ ...ctx(db), actor: owner }, { orderId: order.id, to })
    }
    const [done] = await db.select().from(t.orders).where(eq(t.orders.id, order.id))
    expect(done.status).toBe('delivered')
    expect(done.deliveredAt).not.toBeNull()
    await expect(transitionOrder({ ...ctx(db), actor: owner }, { orderId: order.id, to: 'cancelled', note: 'late' })).rejects.toMatchObject({ code: 'invalid_transition' })
  })

  it('returns reserved stock on cancellation and records why', async () => {
    const owner = await ownerActor(db)
    const { order, item } = await newOrder(visitor())
    const reserved = await stockOf(db, item.id)
    expect(reserved).toBe(item.stock - 1)
    await expect(transitionOrder({ ...ctx(db), actor: owner }, { orderId: order.id, to: 'cancelled' })).rejects.toMatchObject({ code: 'reason_required' })
    const res = await transitionOrder({ ...ctx(db), actor: owner }, { orderId: order.id, to: 'cancelled', note: 'Худалдан авагч цуцалсан' })
    expect(res.restored).toBe(1)
    expect(await stockOf(db, item.id)).toBe(item.stock)
    const ledger = await db.select().from(t.inventoryTransactions).where(eq(t.inventoryTransactions.orderId, order.id))
    expect(ledger.map((l) => [l.reason, l.delta])).toEqual(
      expect.arrayContaining([
        ['order_reserved', -1],
        ['order_cancelled', 1],
      ]),
    )
  })

  it('lets the public demo change only orders its own browser placed', async () => {
    const mine = visitor()
    const { order } = await newOrder(mine)
    const otherVisitorsDemo = await demoActor(db, visitor())
    await expect(transitionOrder({ ...ctx(db), actor: otherVisitorsDemo }, { orderId: order.id, to: 'confirmed' })).rejects.toMatchObject({ code: 'demo_scope' })
    const myDemo = await demoActor(db, mine)
    await transitionOrder({ ...ctx(db), actor: myDemo }, { orderId: order.id, to: 'confirmed' })
    const [sample] = await db.select().from(t.orders).where(eq(t.orders.number, 'MN-09013'))
    await expect(transitionOrder({ ...ctx(db), actor: myDemo }, { orderId: sample.id, to: 'confirmed' })).rejects.toMatchObject({ code: 'demo_scope' })
  })

  it('simulates QPay as a labelled demo payment, never as a real one', async () => {
    const v = visitor()
    const { order } = await newOrder(v, 'qpay')
    const fresh = await findCustomerOrder(db, order.number, { visitorKey: v })
    expect(fresh).not.toBeNull()
    const payment = await ensureQpayInvoice(db, fresh!, 'http://test.local')
    expect(payment).toMatchObject({ mode: 'mock', isSimulated: true, status: 'pending', amount: order.total })
    const first = await simulateQpayPayment(ctx(db), order.number, { visitorKey: v })
    expect(first.already).toBe(false)
    const [after] = await db.select().from(t.orders).where(eq(t.orders.id, order.id))
    expect(after.paymentStatus).toBe('simulated')
    expect(after.status).toBe('confirmed')
    expect((await simulateQpayPayment(ctx(db), order.number, { visitorKey: v })).already).toBe(true)
    // A stranger without the link or the browser can't touch it.
    await expect(simulateQpayPayment(ctx(db), order.number, { visitorKey: visitor() })).rejects.toBeInstanceOf(ServiceError)
  })

  it('only lets staff record a cash payment', async () => {
    const v = visitor()
    const { order } = await newOrder(v, 'cash_on_delivery')
    await expect(recordCashPayment({ ...ctx(db), actor: await demoActor(db, v) }, { orderId: order.id })).rejects.toMatchObject({ code: 'demo_read_only' })
    await recordCashPayment({ ...ctx(db), actor: await ownerActor(db) }, { orderId: order.id })
    const [after] = await db.select().from(t.orders).where(eq(t.orders.id, order.id))
    expect(after.paymentStatus).toBe('paid')
  })

  it('opens an order page only with its secret link or from the browser that placed it', async () => {
    const v = visitor()
    const { placed } = await newOrder(v)
    expect(await findCustomerOrder(db, placed.number, { token: placed.accessToken })).not.toBeNull()
    expect(await findCustomerOrder(db, placed.number, { visitorKey: v })).not.toBeNull()
    expect(await findCustomerOrder(db, placed.number, { token: 'wrong-token' })).toBeNull()
    expect(await findCustomerOrder(db, placed.number, { visitorKey: visitor() })).toBeNull()
    expect(await findCustomerOrder(db, 'MN-09001', {})).toBeNull()
  })
})
