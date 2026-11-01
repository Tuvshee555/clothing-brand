// The assistant must answer only from the database. These tests compare its
// catalogue-mode answers with live rows — and change the rows to prove it.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { amountsIn, stockCountsIn } from '@/lib/fact-check'
import * as t from '@/server/db/schema'
import { answerFromCatalog } from '@/server/assistant/engine'
import { allowedAmounts, buildToolContext, checkStock } from '@/server/assistant/tools'
import { createTestDb, variant, type TestDb } from './helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

async function ask(message: string, context: { slugs?: string[]; pageSlug?: string } = {}) {
  const tc = await buildToolContext(db)
  const reply = answerFromCatalog(tc, message, { slugs: context.slugs ?? [], pageSlug: context.pageSlug ?? null })
  // Every amount the assistant writes must exist in the database.
  const allowed = allowedAmounts(tc)
  for (const amount of amountsIn(reply.reply)) expect(allowed.has(amount), `invented amount ${amount} in: ${reply.reply}`).toBe(true)
  return reply
}

describe('shopping assistant (catalogue mode)', () => {
  it('lists hoodies with prices from the database', async () => {
    const r = await ask('Танайд ямар hoodie байна?')
    expect(r.reply).toContain('Оверсайз hoodie')
    expect(r.reply).toContain('219,000₮')
    expect(r.products.map((p) => p.slug)).toContain('oversized-hoodie')
  })

  it('answers size availability with exact live stock', async () => {
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    const r = await ask('Хар hoodie L размер байгаа юу?')
    expect(r.reply).toContain('Хар, L')
    expect(stockCountsIn(r.reply)).toContain(blackL.stock)
    // Sell it out in the database: the next answer must change.
    await db.update(t.productVariants).set({ stock: 0 }).where(eq(t.productVariants.id, blackL.id))
    const after = await ask('Хар hoodie L размер байгаа юу?')
    expect(after.reply).toMatch(/дууссан/)
    await db.update(t.productVariants).set({ stock: blackL.stock }).where(eq(t.productVariants.id, blackL.id))
  })

  it('resolves "is size L available?" against the product being viewed', async () => {
    const r = await ask('L размер байгаа юу?', { pageSlug: 'double-faced-wool-coat' })
    expect(r.reply).toContain('Ноосон пальто')
    const tc = await buildToolContext(db)
    const truth = checkStock(tc, { product: 'double-faced-wool-coat', size: 'L' })
    expect('variants' in truth && truth.variants?.length).toBeTruthy()
  })

  it('finds the cheapest jacket', async () => {
    const r = await ask('Хамгийн хямд хүрэм аль нь вэ?')
    expect(r.reply).toContain('Дулаалгатай хантааз')
    expect(r.reply).toContain('199,000₮')
  })

  it('lists only products under a price limit', async () => {
    const r = await ask('200,000₮-өөс доош ямар бараа байна?')
    const prices = amountsIn(r.reply).filter((n) => n !== 200_000)
    expect(prices.length).toBeGreaterThan(0)
    for (const p of prices) expect(p).toBeLessThan(200_000)
  })

  it('recommends winter products by their tags', async () => {
    const r = await ask('Өвөлд ямар хувцас тохирох вэ?')
    expect(r.products.length).toBeGreaterThan(0)
    const tc = await buildToolContext(db)
    for (const card of r.products) expect(tc.catalog.find((p) => p.slug === card.slug)?.tags).toContain('winter')
  })

  it('compares the products just shown', async () => {
    const r = await ask('Эдгээрийн ялгаа юу вэ?', { slugs: ['oxford-shirt', 'linen-camp-shirt'] })
    expect(r.reply).toContain('Оксфорд цамц')
    expect(r.reply).toContain('Маалинган цамц')
    expect(r.reply).toContain('Материал')
  })

  it('answers delivery, ordering and order-change questions from the stored policies', async () => {
    const delivery = await ask('Хүргэлтийн нөхцөл ямар вэ?')
    expect(delivery.reply).toContain('6,000₮')
    expect(delivery.reply).toContain('200,000₮')
    expect((await ask('Яаж захиалах вэ?')).reply).toContain('Сагсанд нэмэх')
    expect((await ask('Захиалгаа өөрчилж болох уу?')).reply).toContain('Захиалгаа өөрчлөх')
  })

  it('admits when it does not know instead of inventing', async () => {
    const r = await ask('Танайд хүүхдийн гутал байна уу?')
    expect(r.products).toHaveLength(0)
    expect(r.reply).toMatch(/олдсонгүй|мэдээлэл надад алга/)
    expect(amountsIn(r.reply)).toHaveLength(0)
  })
})
