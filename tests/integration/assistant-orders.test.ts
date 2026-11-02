// Chat orders: the assistant creates an order only after an explicit "тийм" on
// a summary it priced from the database, exactly once, through the checkout's
// own order core, with the reservation policy — and never marks it paid.
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as t from '@/server/db/schema'
import { idempotencyKeyFor, placeChatOrder } from '@/server/assistant/chat-order'
import { loadAssistantSettings } from '@/server/assistant/tools'
import { getCartView } from '@/server/services/cart'
import { adjustStock } from '@/server/services/inventory'
import { demoCanTouch, ensureQpayInvoice, findCustomerOrder, simulateQpayPayment } from '@/server/services/orders'
import { releaseExpiredChatOrders } from '@/server/services/reservations'
import { ctx, createTestDb, demoActor, ownerActor, stockOf, variant, visitor, type TestDb } from './helpers'
import { lastMeta, startChat } from './chat-helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  delete process.env.OPENAI_API_KEY
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

async function setStock(slug: string, color: string, size: string, value: number) {
  const v = await variant(db, slug, color, size)
  if (v.stock !== value) await adjustStock({ ...ctx(db), actor: await ownerActor(db) }, { variantId: v.id, mode: 'set', value, reason: 'adjustment', note: 'test' })
  return v
}

const ordersOf = (visitorKey: string) => db.select().from(t.orders).where(eq(t.orders.visitorId, visitorKey))

/** Walks a chat to the confirmation summary for the black L hoodie. */
async function toSummary(chat = startChat(db)) {
  const offer = await chat.say('Хар hoodie L авъя')
  expect(offer?.text).toContain('Оверсайз hoodie — Хар / L')
  expect(offer?.actions?.some((a) => a.type === 'add_to_cart')).toBe(true)
  expect((await chat.say('энд захиалъя'))?.text).toMatch(/Нэр, утасны дугаараа/)
  expect((await chat.say('Бат 9911 2233'))?.text).toMatch(/Хүргэлтийн хаягаа/)
  const summary = await chat.say('Хан-Уул, 15-р хороо, 3-р байр, 45 тоот')
  expect(summary?.text).toContain('Захиалгын мэдээлэл')
  return { chat, summary: summary! }
}

describe('chat order', () => {
  beforeEach(async () => {
    await setStock('oversized-hoodie', 'black', 'L', 5)
  })

  it('is created once, after "тийм", server-priced, with stock reserved and unpaid', async () => {
    const { chat, summary } = await toSummary()
    // 219,000₮ is over the 200,000₮ threshold: standard delivery is free.
    expect(summary.text).toContain('Нийт: 219,000₮')
    expect(summary.text).toMatch(/симуляц/)
    expect(await ordersOf(chat.visitorKey)).toHaveLength(0)
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')

    const created = await chat.say('тийм')
    const number = /MN-\d+/.exec(created!.text)?.[0]
    expect(number).toBeTruthy()
    const orders = await ordersOf(chat.visitorKey)
    expect(orders).toHaveLength(1)
    const [order] = orders
    expect(order).toMatchObject({ number, source: 'assistant', status: 'pending', paymentStatus: 'unpaid', paymentMethod: 'qpay', total: 219_000, shippingFee: 0, district: 'Хан-Уул', customerPhone: '99112233', conversationId: chat.conversationId })
    expect(order.idempotencyKey).toMatch(/^chat:/)
    expect(order.expiresAt!.getTime() - order.placedAt.getTime()).toBe(60 * 60_000)
    expect(await stockOf(db, blackL.id)).toBe(4)
    const ledger = await db.select().from(t.inventoryTransactions).where(and(eq(t.inventoryTransactions.orderId, order.id), eq(t.inventoryTransactions.reason, 'order_reserved')))
    expect(ledger).toHaveLength(1)
    expect(created?.actions?.some((a) => a.type === 'link' && a.href === `/orders/${number}`)).toBe(true)

    // A second "тийм" never creates another order.
    const again = await chat.say('тийм')
    expect(again?.text).toMatch(/аль хэдийн бүртгэгдсэн/)
    expect(await ordersOf(chat.visitorKey)).toHaveLength(1)
    expect(await stockOf(db, blackL.id)).toBe(4)
  })

  it('declining at the summary creates nothing', async () => {
    const { chat } = await toSummary()
    const r = await chat.say('үгүй')
    expect(r?.text).toMatch(/цуцаллаа/)
    expect(await ordersOf(chat.visitorKey)).toHaveLength(0)
    expect((await lastMeta(db, chat.conversationId!)).events).toContain('chat_order_cancelled')
  })

  it('stock sold out between the summary and "тийм": no order, the customer is told', async () => {
    const { chat } = await toSummary()
    await setStock('oversized-hoodie', 'black', 'L', 0)
    const r = await chat.say('тийм')
    expect(r?.text).toMatch(/үлдэгдэл өөрчлөгдсөн/)
    expect(await ordersOf(chat.visitorKey)).toHaveLength(0)
  })

  it('a price change between the summary and "тийм" shows the new total first', async () => {
    const { chat } = await toSummary()
    await db.update(t.products).set({ basePrice: 199_000 }).where(eq(t.products.slug, 'oversized-hoodie'))
    const r = await chat.say('тийм')
    expect(r?.text).toMatch(/өөрчлөгдсөн/)
    expect(r?.text).toContain('Нийт: 205,000₮') // 199,000₮ + 6,000₮ delivery (now under the free threshold)
    expect(await ordersOf(chat.visitorKey)).toHaveLength(0)
    await chat.say('тийм')
    const [order] = await ordersOf(chat.visitorKey)
    expect(order.total).toBe(205_000)
    await db.update(t.products).set({ basePrice: 219_000 }).where(eq(t.products.slug, 'oversized-hoodie'))
  })

  it('a corrected detail at the summary is applied and re-summarised', async () => {
    const { chat } = await toSummary()
    const r = await chat.say('шуурхай хүргэлтээр')
    expect(r?.text).toContain('шуурхай')
    expect(r?.text).toContain('12,000₮')
    expect(r?.text).toContain('Нийт: 231,000₮')
  })

  it('racing confirmations of the same draft create one order', async () => {
    const visitorKey = visitor()
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    const settings = await loadAssistantSettings(db)
    const [conversation] = await db.insert(t.chatConversations).values({ channel: 'website', visitorId: visitorKey }).returning()
    const request = {
      conversationId: conversation.id,
      draftId: 'draft-race',
      variantId: blackL.id,
      quantity: 1,
      name: 'Тест',
      phone: '99112233',
      shippingMethod: 'ub-standard',
      district: 'Баянгол',
      address: '3-р хороо, 12-р байр, 8 тоот',
      expectedTotal: 219_000,
    }
    const results = await Promise.all([1, 2, 3].map(() => placeChatOrder(ctx(db), visitorKey, request, settings)))
    expect(new Set(results.map((r) => r.number)).size).toBe(1)
    expect(results.filter((r) => r.duplicate)).toHaveLength(2)
    expect(await ordersOf(visitorKey)).toHaveLength(1)
    expect(await stockOf(db, blackL.id)).toBe(blackL.stock - 1)
    const [order] = await ordersOf(visitorKey)
    expect(order.idempotencyKey).toBe(idempotencyKeyFor(request))
  })

  it('reservation policy: one unpaid chat order per browser, at most 5 of one option', async () => {
    const visitorKey = visitor()
    const v = await variant(db, 'essential-cotton-tee', 'black', 'M')
    const settings = await loadAssistantSettings(db)
    const [conversation] = await db.insert(t.chatConversations).values({ channel: 'website', visitorId: visitorKey }).returning()
    const base = { conversationId: conversation.id, variantId: v.id, name: 'Тест', phone: '99112233', shippingMethod: 'ub-standard', district: 'Баянгол', address: '3-р хороо, 12-р байр, 8 тоот' }
    await expect(placeChatOrder(ctx(db), visitorKey, { ...base, draftId: 'a', quantity: 6, expectedTotal: 6 * 89_000 }, settings)).rejects.toMatchObject({ code: 'quantity_limit' })
    const first = await placeChatOrder(ctx(db), visitorKey, { ...base, draftId: 'b', quantity: 1, expectedTotal: 95_000 }, settings)
    await expect(placeChatOrder(ctx(db), visitorKey, { ...base, draftId: 'c', quantity: 1, expectedTotal: 95_000 }, settings)).rejects.toMatchObject({
      code: 'reservation_limit',
      details: { number: first.number },
    })
    // Another browser is not blocked by this one's hold.
    const other = visitor()
    const [c2] = await db.insert(t.chatConversations).values({ channel: 'website', visitorId: other }).returning()
    await expect(placeChatOrder(ctx(db), other, { ...base, conversationId: c2.id, draftId: 'd', quantity: 1, expectedTotal: 95_000 }, settings)).resolves.toMatchObject({ duplicate: false })
  })

  it('an expired hold is released once, frees the stock and no longer blocks a new chat order', async () => {
    const visitorKey = visitor()
    const v = await variant(db, 'essential-cotton-tee', 'white', 'M')
    const settings = await loadAssistantSettings(db)
    const [conversation] = await db.insert(t.chatConversations).values({ channel: 'website', visitorId: visitorKey }).returning()
    const base = { conversationId: conversation.id, variantId: v.id, quantity: 2, name: 'Тест', phone: '99112233', shippingMethod: 'ub-standard', district: 'Баянгол', address: '3-р хороо, 12-р байр, 8 тоот', expectedTotal: 184_000 }
    const order = await placeChatOrder(ctx(db), visitorKey, { ...base, draftId: 'x' }, settings)
    expect(await stockOf(db, v.id)).toBe(v.stock - 2)
    const later = new Date(Date.now() + 61 * 60_000)
    expect(await releaseExpiredChatOrders(db, { now: later, visitorKey })).toEqual({ cancelled: 1, unitsReturned: 2 })
    expect(await releaseExpiredChatOrders(db, { now: later, visitorKey })).toEqual({ cancelled: 0, unitsReturned: 0 })
    expect(await stockOf(db, v.id)).toBe(v.stock)
    const [row] = await db.select().from(t.orders).where(eq(t.orders.number, order.number))
    expect(row.status).toBe('cancelled')
    // The next chat order of the same browser goes through (the expired one does not count).
    const next = await placeChatOrder({ ...ctx(db), now: later }, visitorKey, { ...base, draftId: 'y' }, settings)
    expect(next.number).not.toBe(order.number)
  })

  it('the demo QPay payment marks the order "simulated", never "paid"', async () => {
    const { chat } = await toSummary()
    await chat.say('тийм')
    const [order] = await ordersOf(chat.visitorKey)
    const found = await findCustomerOrder(db, order.number, { visitorKey: chat.visitorKey })
    await ensureQpayInvoice(db, found!, 'http://localhost:3200')
    await simulateQpayPayment(ctx(db), order.number, { visitorKey: chat.visitorKey })
    const [after] = await db.select().from(t.orders).where(eq(t.orders.id, order.id))
    expect(after.paymentStatus).toBe('simulated')
    // The public demo admin may move its own chat order, not another browser's.
    expect(demoCanTouch(await demoActor(db, chat.visitorKey), after)).toBe(true)
    expect(demoCanTouch(await demoActor(db, visitor()), after)).toBe(false)
    // A paid (simulated) order is not released by the expiry job.
    expect((await releaseExpiredChatOrders(db, { now: new Date(Date.now() + 2 * 3_600_000), visitorKey: chat.visitorKey })).cancelled).toBe(0)
  })

  it('"сагсанд нэм" puts the exact variant in this browser’s cart', async () => {
    const chat = startChat(db)
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    const r = await chat.say('Хар hoodie L сагсанд нэм')
    expect(r?.text).toMatch(/Сагсанд нэмлээ/)
    const cart = await getCartView(db, chat.visitorKey)
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0]).toMatchObject({ variantId: blackL.id, quantity: 1 })
  })
})
