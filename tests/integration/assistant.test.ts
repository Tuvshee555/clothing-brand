// The assistant must answer only from the database. These tests run real
// conversations through the handler (catalogue mode — no model) against a
// cloned, seeded database, compare the answers with live rows and change the
// rows (through the admin's own stock service) to prove the answer follows.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { amountsIn, stockCountsIn } from '@/lib/fact-check'
import * as t from '@/server/db/schema'
import { allowedAmounts, buildToolContext } from '@/server/assistant/tools'
import { adjustStock } from '@/server/services/inventory'
import { ctx, createTestDb, ownerActor, variant, type TestDb } from './helpers'
import { lastMeta, startChat } from './chat-helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  delete process.env.OPENAI_API_KEY
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

/** Every amount and product link in a reply must exist in the database. */
async function assertGrounded(text: string, asked = '') {
  const tc = await buildToolContext(db)
  const allowed = allowedAmounts(tc)
  for (const amount of amountsIn(text)) if (!amountsIn(asked).includes(amount)) expect(allowed.has(amount), `invented amount ${amount} in: ${text}`).toBe(true)
  for (const m of text.matchAll(/\/products\/([a-z0-9-]+)/g)) expect(tc.catalog.some((p) => p.slug === m[1]), `dead link ${m[1]}`).toBe(true)
}

async function setStock(slug: string, color: string, size: string, value: number) {
  const v = await variant(db, slug, color, size)
  if (v.stock === value) return v
  await adjustStock({ ...ctx(db), actor: await ownerActor(db) }, { variantId: v.id, mode: 'set', value, reason: 'adjustment', note: 'test' })
  return v
}

describe('the reference questions', () => {
  beforeEach(async () => {
    await setStock('oversized-hoodie', 'black', 'L', 5)
  })

  it('«Энэ цамц хэд вэ?» on a shirt page: that shirt’s price', async () => {
    const chat = startChat(db)
    const r = await chat.say('Энэ цамц хэд вэ?', { pageSlug: 'oxford-shirt' })
    expect(r?.text).toContain('Оксфорд цамц')
    expect(r?.text).toContain('139,000₮')
    await assertGrounded(r!.text)
  })

  it('«Хар өнгө байгаа юу?» then «L размер бэлэн байгаа юу?»: the exact black L variant', async () => {
    const chat = startChat(db)
    const black = await chat.say('Хар өнгө байгаа юу?', { pageSlug: 'oversized-hoodie' })
    expect(black?.text).toContain('Хар')
    expect(black?.text).not.toContain('Латте:')
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    const l = await chat.say('L размер бэлэн байгаа юу?', { pageSlug: 'oversized-hoodie' })
    expect(l?.text).toContain('Хар / L')
    expect(stockCountsIn(l!.text)).toEqual([blackL.stock])
    expect(l?.actions?.some((a) => a.type === 'add_to_cart' && a.variantId === blackL.id)).toBe(true)
  })

  it('«Энэ өмдний өөр өнгө бий юу?»: the other colours of the trousers in focus', async () => {
    const chat = startChat(db)
    await chat.say('Хөвөн спорт өмд байгаа юу?')
    const r = await chat.say('Энэ өмдний өөр өнгө бий юу?')
    expect(r?.text).toContain('Хөвөн спорт өмд')
    expect(r?.text).toContain('Түүхий цагаан')
    expect(r?.text).toContain('Цайвар саарал')
  })

  it('«200,000₮-өөс доош ямар цамц байна?»: shirts only, every price under the limit', async () => {
    const chat = startChat(db)
    const r = await chat.say('200,000₮-өөс доош ямар цамц байна?')
    expect(r?.text).toContain('Оксфорд цамц')
    const prices = amountsIn(r!.text).filter((n) => n !== 200_000)
    expect(prices.length).toBeGreaterThan(2)
    for (const p of prices) expect(p).toBeLessThanOrEqual(200_000)
    expect(r?.text).not.toContain('Ноосон пальто')
  })

  it('«Хүргэлт хэд хоног вэ?»: delivery times from the shipping methods', async () => {
    const r = await startChat(db).say('Хүргэлт хэд хоног вэ?')
    expect(r?.text).toContain('Ажлын 1–2 өдөр')
    expect(r?.text).toContain('2–5 хоног')
    expect(r?.text).toContain('Тухайн өдөр')
  })

  it('«Яаж захиалах вэ?»: the website steps and ordering in the chat', async () => {
    const r = await startChat(db).say('Яаж захиалах вэ?')
    expect(r?.text).toContain('Сагсанд нэмэх')
    expect(r?.text).toMatch(/авъя/)
  })

  it('«Захиалгынхаа явцыг яаж шалгах вэ?»: where and how to track an order', async () => {
    const r = await startChat(db).say('Захиалгынхаа явцыг яаж шалгах вэ?')
    expect(r?.text).toContain('/orders')
    expect(r?.text).toMatch(/MN-/)
  })
})

describe('variant intelligence', () => {
  it('never confuses black with grey or M with L', async () => {
    await setStock('oversized-hoodie', 'black', 'L', 0)
    await setStock('oversized-hoodie', 'black', 'M', 3)
    await setStock('oversized-hoodie', 'grey-marl', 'L', 6)
    const chat = startChat(db)
    const r = await chat.say('Хар hoodie L размер байгаа юу?')
    expect(r?.text).toMatch(/Хар \/ L.*дууссан/)
    // Alternatives: black in other sizes, L in other colours — with their own counts.
    expect(r?.text).toMatch(/Хар өнгөөр байгаа хэмжээ: [^\n]*M \(3 ш\)/)
    expect(r?.text).toMatch(/L хэмжээ бусад өнгөөр: [^\n]*Цайвар саарал \(6 ш\)/)
    expect(r?.actions?.some((a) => a.type === 'add_to_cart')).toBe(false)
    expect(await lastMeta(db, chat.conversationId!)).toMatchObject({ events: expect.arrayContaining(['variant_unavailable']) })

    const grey = await chat.say('Саарал L байгаа юу?')
    expect(grey?.text).toContain('Цайвар саарал / L')
    expect(stockCountsIn(grey!.text)).toEqual([6])
    await setStock('oversized-hoodie', 'black', 'L', 5)
  })

  it('changing a variant’s stock in the admin changes the next answer', async () => {
    const chat = startChat(db)
    await setStock('oversized-hoodie', 'black', 'L', 5)
    const before = await chat.say('Хар hoodie L байгаа юу?')
    expect(stockCountsIn(before!.text)).toEqual([5])
    await setStock('oversized-hoodie', 'black', 'L', 2)
    const after = await chat.say('Хар hoodie L байгаа юу?')
    expect(after?.text).toMatch(/2 ширхэг/)
    await setStock('oversized-hoodie', 'black', 'L', 0)
    const sold = await chat.say('Хар hoodie L байгаа юу?')
    expect(sold?.text).toMatch(/дууссан/)
    await setStock('oversized-hoodie', 'black', 'L', 5)
  })

  it('a colour the product does not come in is said so, with the real colours', async () => {
    const r = await startChat(db).say('Дулаалгатай хантааз хар өнгөөр байгаа юу?')
    expect(r?.text).toMatch(/хар өнгөөр байхгүй/)
    expect(r?.text).toContain('Хар хөх')
  })

  it('a size the product does not come in is said so', async () => {
    const r = await startChat(db).say('Оксфорд цамц XS байгаа юу?')
    expect(r?.text).toMatch(/XS хэмжээгүй/)
  })

  it('per-size prices: the XXL hoodie costs more', async () => {
    const chat = startChat(db)
    const r = await chat.say('Оверсайз hoodie хэд вэ?')
    expect(r?.text).toContain('219,000₮')
    expect(r?.text).toContain('229,000₮')
    const xxl = await chat.say('XXL хэмжээ хэд вэ?')
    expect(xxl?.text).toContain('XXL хэмжээ: **229,000₮**')
  })

  it('a price change in the admin reaches the next answer', async () => {
    const chat = startChat(db)
    await db.update(t.products).set({ basePrice: 145_000 }).where(eq(t.products.slug, 'oxford-shirt'))
    const r = await chat.say('Оксфорд цамц хэд вэ?')
    expect(r?.text).toContain('145,000₮')
    await db.update(t.products).set({ basePrice: 139_000 }).where(eq(t.products.slug, 'oxford-shirt'))
  })

  it('numeric waist sizes on jeans', async () => {
    const chat = startChat(db)
    await chat.say('Шулуун жинс', { pageSlug: 'straight-selvedge-jeans' })
    const r = await chat.say('30 размер байгаа юу?', { pageSlug: 'straight-selvedge-jeans' })
    expect(r?.text).toMatch(/30/)
    expect(r?.text).toContain('Хар хөх')
  })
})

describe('shopping help', () => {
  it('material, care and fit exactly as published', async () => {
    const tc = await buildToolContext(db)
    const p = tc.catalog.find((x) => x.slug === 'cashmere-crew-sweater')!
    const r = await startChat(db).say('Ноолууран свитер ямар материалтай вэ, яаж угаах вэ?')
    expect(r?.text).toContain(p.material)
    expect(r?.text).toContain(tc.details.get(p.id)!.care)
  })

  it('sizing advice uses the size chart and never picks a size from height and weight', async () => {
    const r = await startChat(db).say('Би 175 см, 70 кг. Оверсайз hoodie аль размер авах вэ?')
    expect(r?.text).toContain('Цээж (см)')
    expect(r?.text).toMatch(/таамаглаж хэлэхгүй/)
    expect(r?.actions?.some((a) => a.type === 'link' && a.href === '/size-guide')).toBe(true)
  })

  it('a chest measurement is read against the size chart, with that size in stock', async () => {
    const r = await startChat(db).say('Цээж 98 см, оверсайз hoodie ямар размер авах вэ?')
    expect(r?.text).toMatch(/Цээж 98 см бол манай хүснэгтээр M хэмжээ/)
    expect(r?.text).toContain('M хэмжээ одоо:')
    expect(r?.text).not.toMatch(/таамаглаж хэлэхгүй/)
    const edge = await startChat(db).say('Цээж 88 см, оверсайз hoodie аль размер вэ?')
    expect(edge?.text).toMatch(/XS \(84–88 см\) ба S \(88–94 см\)/)
  })

  it('compares the products just listed', async () => {
    const chat = startChat(db)
    await chat.say('Оксфорд цамц, маалинган цамц хоёрын ялгаа юу вэ?')
    const r = chat.last()
    expect(r?.text).toContain('Оксфорд цамц')
    expect(r?.text).toContain('Маалинган цамц')
    expect(r?.text).toContain('Материал')
  })

  it('a numbered pick from a list answers the question that produced the list', async () => {
    const chat = startChat(db)
    const list = await chat.say('Ямар жинс байна?')
    expect(list?.text).toMatch(/1\)/)
    const r = await chat.say('2')
    expect(r?.text).toMatch(/Өндөр бүсэлхийтэй жинс|Шулуун жинс/)
  })

  it('recommends winter clothes by their tags', async () => {
    const r = await startChat(db).say('Өвөлд ямар хувцас тохирох вэ?')
    const tc = await buildToolContext(db)
    expect(r?.cards?.length).toBeGreaterThan(0)
    for (const card of r!.cards!) expect(tc.catalog.find((p) => p.slug === card.slug)?.tags).toContain('winter')
  })

  it('sells no shoes (they moved to the ALKHAM demo) and says so instead of inventing', async () => {
    const r = await startChat(db).say('40 размерын пүүз байна уу')
    expect(r?.cards ?? []).toHaveLength(0)
    expect(amountsIn(r!.text)).toHaveLength(0)
  })

  it('admits what is not in the catalogue instead of inventing', async () => {
    const chat = startChat(db)
    const r = await chat.say('Танайд хүүхдийн гутал байна уу?')
    expect(r?.cards ?? []).toHaveLength(0)
    expect(r?.text).toMatch(/олдсонгүй/)
    expect(amountsIn(r!.text)).toHaveLength(0)
    expect((await lastMeta(db, chat.conversationId!)).events).toContain('unanswered')
  })

  it('quotes the owner’s FAQ verbatim', async () => {
    const [faq] = await db.select().from(t.chatFaqs).limit(1)
    const r = await startChat(db).say(faq.question)
    expect(r?.text).toBe(faq.answer)
  })
})

describe('Latin-script and informal Mongolian', () => {
  const cases: [string, string | RegExp, string?][] = [
    ['ene tsamts hed ve', 'Оксфорд цамц', 'oxford-shirt'],
    ['har hoodie L razmer bga yu', 'Хар / L'],
    ['hurgelt hed honog ve', 'Ажлын 1–2 өдөр'],
    ['yaj zahialah ve', 'Сагсанд нэмэх'],
    ['200k-aas doosh tsamts bga yu', 'Оксфорд цамц'],
    ['palito bnu', /пальто/],
    ['butsaaj boloh uu', 'Буцаалт'],
    ['zahialgaa yaj shalgah ve', '/orders'],
    ['Хар hoodie L бн уу', 'Хар / L'],
  ]
  for (const [text, expected, page] of cases) {
    it(text, async () => {
      const r = await startChat(db).say(text, { pageSlug: page ?? null })
      if (typeof expected === 'string') expect(r?.text).toContain(expected)
      else expect(r?.text).toMatch(expected)
      await assertGrounded(r!.text, text)
    })
  }
})
