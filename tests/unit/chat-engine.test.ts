// The engine's pure pieces: Mongolian (Cyrillic, Latin, informal) understanding,
// clothing colours and sizes, hand-over rules, reservation policy, model routing,
// the fact checks and the analytics.
import { describe, expect, it } from 'vitest'
import { colorMentions, matchColors, normShopper, parseSizes } from '@/lib/assistant/fashion'
import { defaultAssistantSettings, parseAssistantSettings } from '@/lib/assistant/settings'
import type { CatalogProduct } from '@/lib/catalog-filter'
import { summarizeReplies } from '@/lib/chat/analytics'
import { shouldAutoResume } from '@/lib/chat/handover'
import { ADD_TO_CART, BUY_INTENT, CHAT_ORDER_HERE, COMPLAINT, HUMAN_REQUEST, NO, PICKUP_QUESTION, YES, isGreeting, isThanksOnly, parseName, parseNumberedChoice, parsePhone, parseQuantity } from '@/lib/chat/intents'
import { matchFaq } from '@/lib/chat/knowledge'
import { costMicroUsd, resolveAiModel, withinBudget } from '@/lib/chat/models'
import { reservationPolicy, reservationWindowText } from '@/lib/chat/reservation'
import { intentProbe, normText, scriptOf } from '@/lib/chat/text'
import { verifyReply } from '@/lib/chat/verify'
import { understand } from '@/server/assistant/understand'
import { variantClaimProblems } from '@/server/assistant/variant-claims'

const probe = (s: string) => intentProbe(s)

describe('Mongolian text bridge', () => {
  it('maps Latin-script Mongolian and slang to Cyrillic', () => {
    expect(normText('une hed ve')).toBe('үнэ хэд вэ')
    expect(normText('unehedve')).toBe('үнэ хэд вэ')
    expect(normText('bga yu')).toBe('байгаа юу')
    expect(normText('hurgelt hed honog ve')).toBe('хүргэлт хэд хоног вэ')
    expect(normText('yaj zahialah ve')).toBe('яаж захиалах вэ')
    expect(normText('sn bnuu')).toBe('сайн байна уу')
    expect(normShopper('har hoodie L razmer bga yu')).toBe('хар hoodie l размер байгаа юу')
    expect(normShopper('ene tsamts hed ve')).toBe('энэ цамц хэд вэ')
    expect(normShopper('ene umdnii uur unge bii yu')).toBe('энэ өмд өөр өнгө бий юу')
  })

  it('tells Latin from Cyrillic', () => {
    expect(scriptOf('har hoodie bga yu')).toBe('latin')
    expect(scriptOf('Хар hoodie байгаа юу')).toBe('cyrillic')
  })
})

describe('intents (Cyrillic, Latin, English)', () => {
  it('requests for a person and complaints', () => {
    for (const s of ['Хүнтэй ярьмаар байна', 'hun bn uu', 'huntei yarimaar bn', 'ajiltantai holbogdmoor bn', 'Оператортой холбооч', 'chatbot bish hun heregtei', 'talk to a human']) expect(HUMAN_REQUEST.test(probe(s)), s).toBe(true)
    for (const s of ['Захиалсан цамц маань өөр хэмжээ ирсэн', 'baraa evdersen irsen', 'урагдсан ирсэн', 'wrong size arrived']) expect(COMPLAINT.test(probe(s)), s).toBe(true)
    expect(COMPLAINT.test(probe('Өөр өнгө бий юу?'))).toBe(false)
    expect(COMPLAINT.test(probe('Буцаах нөхцөл ямар вэ?'))).toBe(false)
  })

  it('purchase intent, but not pickup questions', () => {
    for (const s of ['авъя', 'hoodie avya', 'zahialya', 'Захиалга өгье', 'I want to buy it']) expect(BUY_INTENT.test(probe(s)), s).toBe(true)
    expect(BUY_INTENT.test(probe('Яаж захиалах вэ?'))).toBe(false)
    expect(PICKUP_QUESTION.test(probe('Очиж авч болох уу?'))).toBe(true)
    expect(CHAT_ORDER_HERE.test(probe('энд захиалъя'))).toBe(true)
    expect(ADD_TO_CART.test(probe('sagsand nemeh'))).toBe(true)
  })

  it('confirmation words', () => {
    for (const s of ['тийм', 'Тийм ээ', 'tiim', 'за', 'ok', 'Баталгаажуулъя']) expect(YES.test(s) || YES.test(normText(s)), s).toBe(true)
    for (const s of ['үгүй', 'ugui', 'болих', 'cancel']) expect(NO.test(s) || NO.test(normText(s)), s).toBe(true)
    expect(YES.test('тийм ч сайн биш')).toBe(false)
  })

  it('greetings and thanks are small talk only when that is all the message says', () => {
    expect(isGreeting('Сайн байна уу')).toBe(true)
    expect(isGreeting('Sn bnuu')).toBe(true)
    expect(isGreeting('Сайн байна уу, hoodie хэд вэ')).toBe(false)
    expect(isThanksOnly('за баярлалаа')).toBe(true)
    expect(isThanksOnly('баярлалаа, үнэ хэд вэ')).toBe(false)
  })

  it('numbered picks, quantities, phones and names', () => {
    expect(parseNumberedChoice('2')).toEqual({ index: 1 })
    expect(parseNumberedChoice('2-р')).toEqual({ index: 1 })
    expect(parseNumberedChoice('хоёрдугаар')).toEqual({ index: 1 })
    expect(parseNumberedChoice('эхнийх нь')).toEqual({ index: 0 })
    expect(parseNumberedChoice('15-р хороо')).toBeNull()
    expect(parseQuantity(normText('2 ширхэг'))).toBe(2)
    expect(parseQuantity(normText('гурван ширхэг авъя'))).toBe(3)
    expect(parseQuantity(normText('30 размер'))).toBeNull()
    expect(parsePhone('Бат 9911 2233')).toBe('99112233')
    expect(parsePhone('+976-8811-2233')).toBe('88112233')
    expect(parsePhone('200,000₮')).toBeNull()
    expect(parseName('Бат 9911 2233')).toBe('Бат')
    expect(parseName('миний нэр Сараа, утас 88112233')).toBe('Сараа')
  })
})

describe('clothing colours and sizes', () => {
  const colors = [
    { id: 'black', name: 'Хар', hex: '#151515' },
    { id: 'navy', name: 'Хар хөх', hex: '#1f2a44' },
    { id: 'grey', name: 'Цайвар саарал', hex: '#c9c7c2' },
    { id: 'lblue', name: 'Цайвар цэнхэр', hex: '#a9c3df' },
    { id: 'mblue', name: 'Дунд цэнхэр', hex: '#5d7fa8' },
  ]
  const match = (text: string) => matchColors(normShopper(text), colors).colors.map((c) => c.id)

  it('never confuses black with navy', () => {
    expect(match('хар байгаа юу')).toEqual(['black'])
    expect(match('хар хөх байгаа юу')).toEqual(['navy'])
    expect(match('navy bga yu')).toEqual(['navy'])
    expect(matchColors(normShopper('хар байгаа юу'), [colors[1]]).colors).toEqual([])
  })

  it('a colour word matches our shades of it; a modifier must match too', () => {
    expect(match('саарал байна уу')).toEqual(['grey'])
    // Navy ("хар хөх") is a dark blue: it is offered for "цэнхэр" too, and named exactly in the reply.
    expect(match('цэнхэр')).toEqual(['navy', 'lblue', 'mblue'])
    expect(match('цайвар цэнхэр')).toEqual(['lblue'])
    expect(colorMentions(normShopper('tsagaan saaral ulaan')).map((c) => c.hue)).toEqual(['white', 'grey', 'red'])
  })

  it('sizes in Latin, Cyrillic and waist numbers', () => {
    const sizes = (s: string) => parseSizes(s, normShopper(s))
    expect(sizes('L размер байгаа юу?')).toEqual(['L'])
    expect(sizes('Л размер байгаа юу?')).toEqual(['L'])
    expect(sizes('har hoodie xl bga yu')).toEqual(['XL'])
    expect(sizes('2XL байна уу')).toEqual(['XXL'])
    expect(sizes('30 размер бий юу')).toEqual(['30'])
    // EU shoe sizes next to a size word, Cyrillic or Latin.
    expect(sizes('40 размерын гутал байна уу')).toEqual(['40'])
    expect(sizes('puuz 43 razmer bga yu')).toEqual(['43'])
    // A lowercase "l" in a long Latin sentence is often the particle "л", not a size.
    expect(sizes('ene l bol sain baraa shig bn daa')).toEqual([])
  })

  it('shoe words: «гутал» means the whole category, a kind of shoe goes by name', () => {
    const garments = (s: string) => understand(s).garments
    expect(garments('Гутал байна уу?')).toEqual([{ word: 'гутал', categories: ['shoes'] }])
    expect(garments('gutal bga yu')).toEqual([{ word: 'гутал', categories: ['shoes'] }])
    expect(garments('puuz hed ve')).toEqual([{ word: 'пүүз', categories: [] }])
    expect(garments('Арьсан ботинк 42 байгаа юу')).toEqual([{ word: 'ботинк', categories: [] }])
  })
})

describe('understanding the reference questions', () => {
  it.each([
    ['Энэ цамц хэд вэ?', { topics: ['price'], deictic: true }],
    ['Хар өнгө байгаа юу?', { colors: [{ phrase: 'хар', hue: 'black' }] }],
    ['L размер бэлэн байгаа юу?', { sizes: ['L'], topics: ['stock'] }],
    ['Энэ өмдний өөр өнгө бий юу?', { deictic: true }],
    ['200,000₮-өөс доош ямар цамц байна?', { maxPrice: 200_000, browse: true }],
    ['Хүргэлт хэд хоног вэ?', { policy: 'delivery_time', topics: [] }],
    ['Яаж захиалах вэ?', { policy: 'ordering', buy: false }],
    ['Захиалгынхаа явцыг яаж шалгах вэ?', { policy: 'tracking' }],
  ])('%s', (text, expected) => {
    expect(understand(text)).toMatchObject(expected)
  })

  it('Latin forms reach the same understanding', () => {
    expect(understand('ene tsamts hed ve')).toMatchObject({ topics: ['price'], deictic: true })
    expect(understand('hurgelt hed honog ve').policy).toBe('delivery_time')
    expect(understand('200k-aas doosh tsamts').maxPrice).toBe(200_000)
    expect(understand('ene umdnii uur unge bii yu').topics).toContain('other_color')
  })

  it('hand-over triggers win', () => {
    expect(understand('Би мөнгөө шилжүүлсэн').handoff).toBe('payment_claim')
    expect(understand('Яаж төлөх вэ?').handoff).toBeNull()
    expect(understand('hun bn uu').handoff).toBe('customer_request')
  })
})

describe('reservation policy and model routing', () => {
  it('defaults and bounds', () => {
    expect(reservationPolicy(null)).toEqual({ minutes: 60, maxActiveOrders: 1, maxQuantityPerItem: 5 })
    expect(reservationPolicy({ reservationMinutes: 2, maxActiveOrders: 99, maxQuantityPerItem: 3 })).toEqual({ minutes: 60, maxActiveOrders: 1, maxQuantityPerItem: 3 })
    expect(reservationWindowText(60)).toBe('60 минут')
    expect(reservationWindowText(180)).toBe('3 цаг')
  })

  it('model: admin choice → known env model → gpt-4.1-mini', () => {
    expect(resolveAiModel('gpt-4.1', 'gpt-4o-mini')).toBe('gpt-4.1')
    expect(resolveAiModel('', 'gpt-4o-mini')).toBe('gpt-4o-mini')
    expect(resolveAiModel('', 'some-unpriced-model')).toBe('gpt-4.1-mini')
    expect(resolveAiModel('gpt-5-pro' as never, undefined)).toBe('gpt-4.1-mini')
    expect(costMicroUsd('gpt-4.1-mini', 1_000_000, 0)).toBe(400_000)
  })

  it('budget: spend must stay under it; 0 turns AI off', () => {
    expect(withinBudget(999_999, 1)).toBe(true)
    expect(withinBudget(1_000_000, 1)).toBe(false)
    expect(withinBudget(0, 0)).toBe(false)
  })

  it('a taken-over chat returns to the assistant only after the silence limit', () => {
    const now = new Date('2026-11-02T12:00:00Z')
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
    expect(shouldAutoResume({ paused: true, hours: 24, lastHumanAt: hoursAgo(25), now })).toBe(true)
    expect(shouldAutoResume({ paused: true, hours: 24, lastHumanAt: hoursAgo(2), now })).toBe(false)
    expect(shouldAutoResume({ paused: true, hours: 0, lastHumanAt: hoursAgo(500), now })).toBe(false)
    expect(shouldAutoResume({ paused: false, hours: 24, lastHumanAt: hoursAgo(25), now })).toBe(false)
  })

  it('stored settings fall back field by field', () => {
    const parsed = parseAssistantSettings({ aiModel: 'not-a-model', reservationMinutes: 30, enabled: false })
    expect(parsed.aiModel).toBe(defaultAssistantSettings().aiModel)
    expect(parsed.reservationMinutes).toBe(30)
    expect(parsed.enabled).toBe(false)
  })
})

describe('fact checks', () => {
  const evidence = { amounts: new Set([219_000]), stockCounts: new Set([5]), allowedPath: (p: string) => p === '/products/oversized-hoodie', emails: new Set(['hello@manan.example']), phones: new Set<string>() }

  it('accepts a grounded reply', () => {
    expect(verifyReply('[Оверсайз hoodie](/products/oversized-hoodie) — 219,000₮, Хар / L: 5 ширхэг.', evidence)).toEqual([])
  })

  it('rejects invented amounts, counts, links, contacts and claims', () => {
    expect(verifyReply('Үнэ 199,000₮', evidence).join()).toMatch(/amount 199000/)
    expect(verifyReply('7 ширхэг байна', evidence).join()).toMatch(/stock count 7/)
    expect(verifyReply('[Пальто](/products/made-up)', evidence).join()).toMatch(/does not exist/)
    expect(verifyReply('https://evil.example/x', evidence).join()).toMatch(/external link/)
    expect(verifyReply('Залгаарай: 9911 2233', evidence).join()).toMatch(/phone/)
    expect(verifyReply('Захиалга тань үүслээ', evidence)).toContain('order_claim')
    expect(verifyReply('Төлбөр тань баталгаажсан', evidence)).toContain('payment_claim')
    expect(verifyReply('20% хямдралтай', evidence)).toContain('percent_claim')
  })

  const hoodie = {
    id: 'p1',
    slug: 'oversized-hoodie',
    name: 'Оверсайз hoodie',
    sizes: ['M', 'L'],
    colors: [
      { id: 'black', code: 'black', name: 'Хар', hex: '#151515' },
      { id: 'grey', code: 'grey', name: 'Цайвар саарал', hex: '#c9c7c2' },
    ],
    variants: [
      { id: 'v1', colorId: 'black', colorCode: 'black', size: 'L', sku: 'A', price: 219_000, stock: 0, lowStockThreshold: 2, isActive: true },
      { id: 'v2', colorId: 'grey', colorCode: 'grey', size: 'L', sku: 'B', price: 219_000, stock: 6, lowStockThreshold: 2, isActive: true },
    ],
  } as unknown as CatalogProduct

  it('variant claims must match the exact colour × size', () => {
    expect(variantClaimProblems('«Оверсайз hoodie» — Цайвар саарал / L: 6 ширхэг байна.', [hoodie])).toEqual([])
    expect(variantClaimProblems('«Оверсайз hoodie» — Хар / L: бэлэн байна.', [hoodie]).join()).toMatch(/sold out but the reply says available/)
    expect(variantClaimProblems('«Оверсайз hoodie» — Цайвар саарал / L дууссан.', [hoodie]).join()).toMatch(/in stock but the reply says sold out/)
    expect(variantClaimProblems('«Оверсайз hoodie» — Цайвар саарал / L: 4 ширхэг байна.', [hoodie]).join()).toMatch(/has 6, the reply says 4/)
    expect(variantClaimProblems('«Оверсайз hoodie» ягаан өнгөөр байгаа.', [hoodie]).join()).toMatch(/does not come in/)
    // Bullets under a product line belong to it.
    expect(variantClaimProblems('«Оверсайз hoodie»:\n- Хар / L: 3 ширхэг байна', [hoodie]).length).toBeGreaterThan(0)
  })
})

describe('owner FAQ matching', () => {
  const faqs = [
    { question: 'Дэлгүүр дээр очиж үзэж болох уу?', answer: 'A' },
    { question: 'Бэлгийн карт байдаг уу?', answer: 'B' },
  ]
  it('matches wording variations, not unrelated questions', () => {
    expect(matchFaq('дэлгүүр дээр нь очиж үзэж болох уу', faqs)?.answer).toBe('A')
    expect(matchFaq('belgiin kart baidag uu', faqs)?.answer).toBe('B')
    expect(matchFaq('Хүргэлт хэд хоног вэ?', faqs)).toBeNull()
  })
})

describe('analytics', () => {
  it('counts intents, the purchase funnel, hand-overs and scripts', () => {
    const at = new Date()
    const s = summarizeReplies(
      [
        { createdAt: at, metadata: { intent: 'product', mode: 'rules', events: ['variant_check'], durationMs: 100 } },
        { createdAt: at, metadata: { intent: 'purchase', mode: 'rules', events: ['purchase_intent', 'offer'], durationMs: 300 } },
        { createdAt: at, metadata: { intent: 'chat_order_created', mode: 'rules', events: ['chat_order_created'] } },
        { createdAt: at, metadata: { intent: 'handoff', mode: 'rules', handoff: 'complaint', events: ['handover:complaint'] } },
        { createdAt: at, metadata: { intent: 'ai', mode: 'ai', events: ['ai_reply'] } },
      ],
      [{ metadata: { script: 'latin' } }, { metadata: { script: 'cyrillic' } }, { metadata: { script: 'cyrillic' } }],
    )
    expect(s.funnel).toMatchObject({ productQuestions: 1, purchaseIntent: 1, offers: 1, chatOrdersCreated: 1 })
    expect(s.handoversByReason).toEqual({ complaint: 1 })
    expect(s.aiReplies).toBe(1)
    expect(s.scripts).toEqual({ cyrillic: 2, latin: 1, other: 0 })
    expect(s.avgDurationMs).toBe(200)
  })
})
