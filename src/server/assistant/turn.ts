// One customer message → one reply, with no database access: the catalogue
// context, conversation memory and the order/cart/AI functions are passed in,
// so the whole conversation flow is testable. Layer order (Lorentz turn.ts at
// 69e4110, adapted to clothing):
//   0. hand-over triggers: payment claim → complaint → request for a person
//   1. purchase layer: an active chat order draft, or purchase intent
//   2. order status (number + phone, or this browser's own orders) and tracking help
//   3. thanks / greeting
//   4. the owner's own FAQ (quoted verbatim), then store policies (delivery time,
//      delivery, returns, exchange, payment, ordering…)
//   5. product answers from the database: exact colour × size stock, price, colours,
//      sizes, material/care/fit, size chart, comparison — named, numbered or in focus
//   6. search / browse with filters (type, price limit, colour, size, season, audience)
//   7. AI behind the fact check (open questions, recommendations, unread phrasing)
//   8. an honest fallback that offers a person. Never silence, never an invented fact.
import type { ChatAction } from '@/lib/assistant/types'
import { sizeLabel, TAG_LABELS } from '@/lib/catalog'
import { sortCatalog, type CatalogProduct } from '@/lib/catalog-filter'
import type { HandoffReason } from '@/lib/chat/handover'
import { matchFaq } from '@/lib/chat/knowledge'
import { FASHION_ALIASES, HUE_LABELS, huesOfColor } from '@/lib/assistant/fashion'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import {
  colorsAnswer,
  compareAnswer,
  factsAnswer,
  imagesAnswer,
  link,
  listAnswer,
  money,
  policyAnswer,
  priceAnswer,
  sizeAdviceAnswer,
  sizesAnswer,
  stockAnswer,
  type Answer,
  type Focus,
} from './answers'
import type { AiResult } from './llm'
import { memoryNote } from './llm'
import { pickCandidate, purchaseTurn, readDraft, type AddToCart, type OrderDraft, type PlaceChatOrder } from './purchase'
import { listCategories, type ToolContext } from './tools'
import { fitsGarment, productRefs, understand, type Topic, type Understood } from './understand'

export interface ChatState {
  focus?: Focus | null
  /** The last numbered list ("2" picks from it) and the question that produced it. */
  candidates?: { productIds: string[]; question: string | null; at: number } | null
  /** The product page the customer had open on the previous message. */
  pageSlug?: string | null
  draft?: OrderDraft | null
  lastOrderNumber?: string | null
  /** An order number the customer gave, waiting for the phone number. */
  pendingOrderLookup?: { number: string; at: number } | null
  /** Consecutive replies that did not answer. */
  unanswered?: number
  /** Set while staff have been asked for (the hand-over reason). */
  handoffReason?: HandoffReason | null
  lastIntent?: string
}

export interface OrderStatusView {
  number: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  total: number
  placedAt: string
  expiresAt?: string | null
}

export interface TurnInput {
  text: string
  history: { role: 'user' | 'assistant'; text: string }[]
  state: ChatState
  tc: ToolContext
  pageSlug: string | null
  now: number
  conversationId: string
  randomId: () => string
  /** Null when AI is unavailable (no key, owner turned it off, budget spent). */
  askAi: ((args: { memory: string; history: { role: 'user' | 'assistant'; content: string }[] }) => Promise<AiResult>) | null
  placeOrder: PlaceChatOrder | null
  addToCart: AddToCart | null
  lookupOrder: (number: string, phone: string) => Promise<OrderStatusView | null>
  visitorOrders: () => Promise<OrderStatusView[]>
}

export interface TurnOutput {
  text: string
  intent: string
  mode: 'rules' | 'ai'
  productIds: string[]
  actions: ChatAction[]
  suggestions: string[]
  state: ChatState
  events: string[]
  handoff: HandoffReason | null
  orderNumber?: string
  cartChanged?: boolean
  ai: AiResult | null
  /** The model call failed (network, HTTP, timeout): logged as a problem, never shown. */
  aiError?: string | null
}

const PRODUCT_TOPICS: Topic[] = ['price', 'stock', 'colors', 'other_color', 'sizes', 'other_size', 'material', 'care', 'fit', 'size_advice', 'description', 'images', 'compare']

const HANDOFF_TEXT: Record<'customer_request' | 'complaint' | 'payment_claim', string> = {
  customer_request: 'Ойлголоо — яриаг ажилтанд шилжүүллээ. Ажилтан энэ чатаар хариулна. Нэр, утасны дугаараа үлдээвэл холбогдоход хялбар.',
  complaint: 'Уучлаарай, ийм зүйл тохиолдсонд харамсаж байна. Асуудлыг ажилтанд шилжүүллээ — захиалгын дугаар (MN-…) болон юу болсныг товч бичээрэй, ажилтан энэ чатаар хариулна.',
  payment_claim: 'Баярлалаа. Төлбөрийг чатаар баталгаажуулах боломжгүй тул ажилтан шалгана — захиалгын дугаараа (MN-…) бичнэ үү. Энэ демо дэлгүүрт бодит мөнгө шилждэггүй, төлбөрийн төлвийг захиалгын хуудаснаас харна.',
}
const DEMO_HANDOFF_NOTE = 'Демо: админ самбарт «Демо горимоор нэвтрэх» дараад «AI чатбот → Ажилтанд шилжүүлэх» хэсгээс энэ яриаг өөрөө хүлээн авч хариулж үзэх боломжтой.'

function orderLine(o: OrderStatusView): string {
  const expiry = o.paymentStatus === 'unpaid' && o.status === 'pending' && o.expiresAt ? ` · төлөх хугацаа ${new Date(o.expiresAt).toLocaleTimeString('mn-MN', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit' })} хүртэл` : ''
  return `- [${o.number}](/orders/${o.number}) — ${ORDER_STATUS_LABELS[o.status]}, ${PAYMENT_STATUS_LABELS[o.paymentStatus].toLowerCase()} · ${money(o.total)}${expiry}`
}

export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const { tc, now } = input
  const u = understand(input.text)
  const catalog = tc.catalog
  const byId = (id: string | null | undefined) => (id ? (catalog.find((p) => p.id === id) ?? null) : null)
  const state: ChatState = { ...input.state }

  // The product in focus: a newly opened product page wins over the conversation's focus.
  const pageProduct = input.pageSlug ? (catalog.find((p) => p.slug === input.pageSlug) ?? null) : null
  let focus: Focus | null = state.focus && byId(state.focus.productId) ? state.focus : null
  if (pageProduct && (state.pageSlug !== input.pageSlug || !focus)) focus = { productId: pageProduct.id, at: now }
  state.pageSlug = input.pageSlug
  const focusProduct = byId(focus?.productId)
  const candidates = (state.candidates?.productIds ?? []).map(byId).filter((p): p is CatalogProduct => !!p)
  const draft = readDraft(state.draft, now)
  if (!draft) state.draft = null

  const done = (a: Answer & { intent: string; mode?: 'rules' | 'ai'; handoff?: HandoffReason | null; orderNumber?: string; cartChanged?: boolean; ai?: AiResult | null; aiError?: string | null; draft?: OrderDraft | null }): TurnOutput => {
    const next: ChatState = { ...state, lastIntent: a.intent }
    if (a.focus !== undefined && a.focus !== null) next.focus = a.focus
    else if (focus && !next.focus) next.focus = focus
    if (a.candidates?.length) next.candidates = { productIds: a.candidates, question: a.events.includes('search') || a.intent === 'clarify' ? u.raw : null, at: now }
    if (a.draft !== undefined) next.draft = a.draft
    if (a.orderNumber) next.lastOrderNumber = a.orderNumber
    const unanswered = a.events.includes('unanswered') && !a.events.includes('product_answer')
    next.unanswered = unanswered ? (state.unanswered ?? 0) + 1 : 0
    if (a.handoff) next.handoffReason = a.handoff
    let text = a.text
    // A purchase in progress is not forgotten when the customer asks something else.
    if (draft && a.draft === undefined && draft.step === 'confirm') text += '\n\n(Захиалгаа баталгаажуулах бол «тийм», болих бол «үгүй» гэж бичнэ үү.)'
    return {
      text,
      intent: a.intent,
      mode: a.mode ?? 'rules',
      productIds: a.productIds,
      actions: a.actions,
      suggestions: a.suggestions.slice(0, 4),
      state: next,
      events: a.events,
      handoff: a.handoff ?? null,
      orderNumber: a.orderNumber,
      cartChanged: a.cartChanged,
      ai: a.ai ?? null,
      aiError: a.aiError ?? null,
    }
  }
  const empty = { productIds: [] as string[], actions: [] as ChatAction[], suggestions: [] as string[], events: [] as string[] }

  // ── 0. Hand-over triggers ──
  if (u.handoff) {
    const again = state.handoffReason ? 'Ажилтанд аль хэдийн мэдэгдсэн байгаа, удахгүй энэ чатаар хариулна. ' : ''
    const text = again ? `${again}Нэмэлт мэдээлэл байвал энд бичээрэй.` : `${HANDOFF_TEXT[u.handoff as keyof typeof HANDOFF_TEXT] ?? HANDOFF_TEXT.customer_request}\n\n${DEMO_HANDOFF_NOTE}\nТэр хооронд бараа, үлдэгдлийн талаар надаас асууж болно.`
    return done({ ...empty, text, intent: 'handoff', handoff: u.handoff, events: [`handover:${u.handoff}`] })
  }

  // ── Which products the message refers to ──
  const refs = productRefs(u, catalog)
  const picked = u.numbered && candidates.length ? pickCandidate(input.text, candidates) : null
  const variantFits = (p: CatalogProduct) => {
    const hues = new Set(u.colors.map((c) => c.hue))
    const colorOk = hues.size === 0 || p.colors.some((c) => [...huesOfColor(c)].some((h) => hues.has(h)))
    const sizeOk = u.sizes.length === 0 || u.sizes.some((s) => p.sizes.includes(s))
    return colorOk && sizeOk
  }
  const searching = u.browse || u.catalogQuestion || u.maxPrice !== null || u.minPrice !== null || u.cheapest || u.priciest
  let product: CatalogProduct | null = picked
  let ambiguous: CatalogProduct[] = []
  if (!product && refs.named.length === 1 && !(searching && !refs.strong)) product = refs.named[0]
  else if (!product && refs.named.length > 1) {
    const narrowed = refs.named.filter((p) => variantFits(p) && fitsGarment(p, u))
    if (narrowed.length === 1 && !searching) product = narrowed[0]
    else ambiguous = narrowed.length ? narrowed : refs.named
  }
  const asksAboutProduct = u.topics.some((t) => PRODUCT_TOPICS.includes(t)) || u.colors.length > 0 || u.sizes.length > 0
  if (!product && !ambiguous.length && refs.typed.length) {
    if (focusProduct && refs.typed.includes(focusProduct) && (u.deictic || (!searching && asksAboutProduct))) product = focusProduct
    else if (refs.typed.length === 1 && !searching) product = refs.typed[0]
    else if (u.deictic && !searching) ambiguous = refs.typed.filter(variantFits)
  }
  // "Хар L байгаа юу?" right after a list: about the products just shown, not the whole catalogue.
  const recentList = state.candidates && now - state.candidates.at < 30 * 60_000 ? candidates : []
  if (!product && !ambiguous.length && !refs.typed.length && !refs.named.length && recentList.length > 1 && (u.colors.length > 0 || u.sizes.length > 0) && !searching) {
    const narrowed = recentList.filter(variantFits)
    if (narrowed.length === 1) product = narrowed[0]
    else if (narrowed.length > 1) ambiguous = narrowed
  }
  // "L размер байгаа юу?", "хэд вэ?", "өөр өнгө бий юу?": about the product in focus.
  if (!product && !ambiguous.length && !refs.typed.length && focusProduct && !searching && (u.deictic || asksAboutProduct || (u.numbers.length > 0 && u.numbers.some((n) => focusProduct.sizes.includes(n))))) {
    product = focusProduct
  }
  // A pick from a list answers the question that produced the list.
  let q: Understood = u
  if (picked && state.candidates?.question && !asksAboutProduct) {
    const pending = understand(state.candidates.question)
    q = { ...u, topics: pending.topics, colors: pending.colors, sizes: pending.sizes, norm: `${u.norm} ${pending.norm}`, probe: `${u.probe}\n${pending.probe}` }
  }

  // ── 1. Purchase layer ──
  const bought = await purchaseTurn({
    u: q,
    tc,
    draft,
    focus: product ? (focus?.productId === product.id ? focus : { productId: product.id, at: now }) : focus,
    product,
    ambiguous: ambiguous.length ? ambiguous : !product && u.buy && refs.typed.length > 1 ? refs.typed.filter(variantFits) : [],
    conversationId: input.conversationId,
    now,
    randomId: input.randomId,
    placeOrder: input.placeOrder,
    addToCart: input.addToCart,
  })
  if (bought) {
    return done({ ...bought, handoff: bought.handoff ?? null, draft: bought.draft, candidates: bought.candidates })
  }

  // ── 2. Orders ──
  const pending = state.pendingOrderLookup && now - state.pendingOrderLookup.at < 30 * 60_000 ? state.pendingOrderLookup : null
  if (u.orderNumber || (pending && u.phone)) {
    const number = u.orderNumber ?? pending!.number
    const own = (await input.visitorOrders()).find((o) => o.number === number)
    const found = own ?? (u.phone ? await input.lookupOrder(number, u.phone) : null)
    if (found) {
      state.pendingOrderLookup = null
      return done({ ...empty, text: `Захиалгын төлөв:\n${orderLine(found)}\nДэлгэрэнгүй явцыг захиалгын хуудаснаас харна.`, intent: 'order_status', events: ['order_status'], actions: [{ type: 'link', href: `/orders/${found.number}`, label: `Захиалга №${found.number}` }] })
    }
    if (!u.phone) {
      state.pendingOrderLookup = { number, at: now }
      return done({ ...empty, text: `${number} захиалгыг шалгахын тулд захиалгад өгсөн утасны дугаараа бичнэ үү.`, intent: 'order_status', events: ['order_status'] })
    }
    state.pendingOrderLookup = null
    return done({ ...empty, text: `${number} дугаартай, ${u.phone.slice(0, 4)}… утастай захиалга олдсонгүй. Дугаар, утсаа шалгаад дахин бичнэ үү.`, intent: 'order_status', events: ['order_status', 'unanswered'] })
  }
  if (u.policy === 'tracking') {
    const answer = policyAnswer(tc, 'tracking')
    const mine = await input.visitorOrders()
    const text = mine.length ? `Энэ хөтчөөр хийсэн таны захиалгууд:\n${mine.slice(0, 5).map(orderLine).join('\n')}\n\n${answer.text}` : answer.text
    return done({ ...answer, text, intent: 'order_status' })
  }

  // A bare "тийм"/"үгүй" with no draft to confirm (e.g. repeated after the order was created).
  if ((u.yes || u.no) && !draft) {
    const text = state.lastOrderNumber && u.yes
      ? `Захиалга №${state.lastOrderNumber} аль хэдийн бүртгэгдсэн — дахин үүсгэхгүй. Төлбөр, явцыг [захиалгын хуудаснаас](/orders/${state.lastOrderNumber}) харна уу.`
      : 'За. Өөр юугаар туслах вэ?'
    return done({ ...empty, text, intent: 'ack', suggestions: ['Ямар бараа байна?', 'Хүргэлт хэд хоног вэ?'] })
  }

  // Name and phone left while waiting for a person: pass them on.
  if (state.handoffReason && u.phone && !asksAboutProduct && !u.policy && u.raw.replace(/[\d\s+()-]/g, '').length <= 40) {
    return done({ ...empty, text: 'Баярлалаа, мэдээллийг тань ажилтанд дамжууллаа. Өөр асуух зүйл байвал энд бичээрэй.', intent: 'contact_capture', handoff: state.handoffReason, events: ['contact_left'] })
  }

  // ── 3. Small talk ──
  if (u.thanks) return done({ ...empty, text: 'Зүгээр ээ 😊 Өөр асуух зүйл байвал чөлөөтэй бичээрэй.', intent: 'thanks' })
  if (u.greeting && !asksAboutProduct && !u.policy) {
    const first = !input.history.some((m) => m.role === 'user')
    return done({
      ...empty,
      text: first ? `${tc.settings.greeting}${focusProduct ? `\nТа одоо ${link(focusProduct)}-г үзэж байна — өнгө, хэмжээ, үлдэгдлийг нь асууж болно.` : ''}` : 'Сайн байна уу! Юугаар туслах вэ?',
      intent: 'greeting',
      suggestions: ['Ямар hoodie байна?', 'Хар hoodie L размер байгаа юу?', '200,000₮-өөс доош ямар цамц байна?', 'Хүргэлт хэд хоног вэ?'],
    })
  }

  // ── 4. The owner's own FAQ (more specific than a policy, so first), then policies ──
  if (!product && !ambiguous.length && !asksAboutProduct && !searching) {
    const faq = matchFaq(input.text, tc.faqs, FASHION_ALIASES)
    if (faq) return done({ ...empty, text: faq.answer, intent: 'faq', events: ['shop_faq'] })
  }

  const productQuestion = (product || ambiguous.length) && asksAboutProduct
  if (u.policy && !productQuestion) {
    if (u.policy === 'size_guide') return done({ ...sizeAdviceAnswer(tc, product ?? focusProduct), intent: 'policy' })
    return done({ ...policyAnswer(tc, u.policy), intent: 'policy' })
  }

  // ── 5. Product answers ──
  const withPolicy = (a: Answer): Answer => (u.policy && u.policy !== 'size_guide' ? { ...a, text: `${a.text}\n\n${policyAnswer(tc, u.policy).text}` } : a)
  if (product && !searching) {
    const t = q.topics
    const has = (x: Topic) => t.includes(x)
    let answer: Answer
    if (has('size_advice')) answer = sizeAdviceAnswer(tc, product)
    else if (has('compare') && candidates.length >= 2) answer = compareAnswer(tc, candidates.includes(product) ? candidates : [product, ...candidates])
    else if (has('other_color')) answer = colorsAnswer(tc, product, q, focus, now, true)
    else if (has('colors') && q.colors.length === 0) answer = colorsAnswer(tc, product, q, focus, now)
    else if (has('stock') || q.colors.length > 0 || q.sizes.length > 0 || has('other_size')) {
      answer = stockAnswer(tc, product, q, focus, now)
      if (has('price') && !answer.actions.some((a) => a.type === 'add_to_cart')) {
        const price = priceAnswer(tc, product, q, focus, now)
        answer = { ...answer, text: `${price.text.split('\n')[0]}\n${answer.text}` }
      }
    } else if (has('sizes')) answer = sizesAnswer(tc, product, q, focus, now)
    else if (has('price')) answer = priceAnswer(tc, product, q, focus, now)
    else if (has('material') || has('care') || has('fit') || has('description')) answer = factsAnswer(tc, product, q, focus, now)
    else if (has('images')) answer = imagesAnswer(product)
    else if (has('recommend') && input.askAi) {
      const ai = await aiAnswer(input, focus)
      if (ai.answer) return done({ ...ai.answer, intent: 'recommendation', mode: 'ai', ai: ai.ai })
      answer = priceAnswer(tc, product, q, focus, now)
    }
    else {
      // Just the product's name: price and what is in stock.
      const price = priceAnswer(tc, product, q, focus, now)
      const stock = stockAnswer(tc, product, q, focus, now)
      answer = { ...stock, text: `${price.text.split('\n')[0]}\n${stock.text}`, events: ['product_answer'] }
    }
    return done({ ...withPolicy(answer), intent: 'product' })
  }
  if (ambiguous.length > 1 && !searching) {
    if (q.topics.includes('compare')) return done({ ...compareAnswer(tc, ambiguous), intent: 'product' })
    // A colour/size question over a few listed products: answer it for each of them.
    if ((q.colors.length > 0 || q.sizes.length > 0) && ambiguous.length <= 3) {
      const parts = ambiguous.map((p) => stockAnswer(tc, p, q, focus, now))
      return done({
        text: parts.map((a) => a.text).join('\n\n'),
        productIds: ambiguous.map((p) => p.id),
        actions: parts
          .flatMap((a, i) => a.actions.filter((x) => x.type === 'add_to_cart').map((x) => ({ ...x, label: `${x.label} · ${ambiguous[i].name}` })))
          .slice(0, 3),
        suggestions: ['Авъя', 'Хүргэлт хэд хоног вэ?'],
        events: ['variant_check'],
        candidates: ambiguous.map((p) => p.id),
        intent: 'product',
      })
    }
    return done({ ...listAnswer(tc, ambiguous, 'Аль барааны талаар асууж байна вэ?'), intent: 'clarify', events: ['clarify'] })
  }
  if (q.topics.includes('compare') && candidates.length >= 2) return done({ ...compareAnswer(tc, candidates), intent: 'product' })
  if (q.topics.includes('size_advice')) return done({ ...sizeAdviceAnswer(tc, focusProduct), intent: 'product' })

  // ── 6. Search / browse ──
  const filtersGiven = u.garments.length > 0 || u.maxPrice !== null || u.minPrice !== null || u.colors.length > 0 || u.sizes.length > 0 || u.tags.length > 0 || u.audience !== null || u.cheapest || u.priciest
  if (filtersGiven && (searching || u.topics.includes('stock') || u.topics.includes('recommend') || !asksAboutProduct || u.garments.length > 0)) {
    const result = search(tc, u, refs.typed, refs.named)
    if (result) return done({ ...result, intent: 'search' })
  }
  if (u.catalogQuestion) {
    const cats = listCategories(tc).filter((c) => c.productCount > 0)
    return done({
      ...empty,
      text: `Манайд ${catalog.length} бараа ${cats.length} ангилалд байна:\n${cats.map((c) => `- [${c.name}](/shop/${c.slug}) — ${c.productCount} бараа${c.priceFrom ? `, ${money(c.priceFrom)}-өөс` : ''}`).join('\n')}\nАль төрлийг сонирхож байна вэ?`,
      intent: 'catalog',
      events: ['search'],
      suggestions: ['Ямар hoodie байна?', 'Өвөлд ямар хувцас тохирох вэ?'],
    })
  }

  // ── 7. AI ──
  if (input.askAi) {
    const ai = await aiAnswer(input, focus)
    if (ai.answer) return done({ ...ai.answer, intent: u.topics.includes('recommend') ? 'recommendation' : 'ai', mode: 'ai', ai: ai.ai })
    // The model's reply failed the fact check, or the call failed: the rules answer instead.
    const fallback = fallbackAnswer(tc, u, focusProduct, state)
    return done({ ...fallback, intent: 'fallback', ai: ai.ai, aiError: ai.error, events: [...fallback.events, ai.error ? 'ai_error' : 'ai_rejected'] })
  }
  if (u.topics.includes('recommend')) {
    const featured = sortCatalog(catalog, 'featured').slice(0, 6)
    return done({ ...listAnswer(tc, featured, 'Одоогоор онцолж буй бараанууд (дэлгүүрийн сонголтоор):'), intent: 'recommendation', events: ['recommendation', 'search'] })
  }

  // ── 8. Fallback ──
  return done({ ...fallbackAnswer(tc, u, focusProduct, state), intent: 'fallback' })
}

async function aiAnswer(input: TurnInput, focus: Focus | null): Promise<{ answer: Answer | null; ai: AiResult | null; error: string | null }> {
  if (!input.askAi) return { answer: null, ai: null, error: null }
  try {
    const memory = memoryNote(input.tc, { focusProductId: focus?.productId, colorId: focus?.colorId, size: focus?.size, pageSlug: input.pageSlug })
    const history = [
      ...input.history.slice(-9).map((m) => ({ role: m.role, content: m.text.slice(0, 1200) })),
      { role: 'user' as const, content: input.text.slice(0, 1200) },
    ]
    const ai = await input.askAi({ memory, history })
    if (!ai.text) return { answer: null, ai, error: null }
    const products = [...new Set(ai.slugs)].map((s) => input.tc.catalog.find((p) => p.slug === s)).filter((p): p is CatalogProduct => !!p)
    return {
      answer: {
        text: ai.text,
        productIds: products.slice(0, 4).map((p) => p.id),
        actions: [],
        suggestions: [],
        events: ['ai_reply'],
        focus: products.length === 1 ? { productId: products[0].id, at: input.now } : undefined,
        candidates: products.length > 1 ? products.slice(0, 6).map((p) => p.id) : undefined,
      },
      ai,
      error: null,
    }
  } catch (err) {
    return { answer: null, ai: null, error: err instanceof Error ? err.message.slice(0, 200) : 'AI error' }
  }
}

/** Products matching type, price, colour/size (same in-stock variant), season and audience. */
function search(tc: ToolContext, u: Understood, typed: CatalogProduct[], named: CatalogProduct[]): Answer | null {
  let pool = typed.length ? typed : named.length > 1 ? named : tc.catalog
  const notes: string[] = []
  if (u.maxPrice !== null) pool = pool.filter((p) => p.minPrice <= u.maxPrice!)
  if (u.minPrice !== null) pool = pool.filter((p) => p.maxPrice >= u.minPrice!)
  if (u.audience) pool = pool.filter((p) => p.audience === u.audience || p.audience === 'unisex')
  const tags = u.tags.filter((t) => t in TAG_LABELS)
  if (tags.length) {
    const tagged = pool.filter((p) => tags.some((t) => p.tags.includes(t)))
    if (tagged.length) pool = tagged
    else notes.push(`${tags.map((t) => TAG_LABELS[t].toLowerCase()).join(', ')} гэж тэмдэглэсэн бараа энэ шүүлтүүрт алга`)
  }
  const hues = new Set(u.colors.map((c) => c.hue))
  if (hues.size || u.sizes.length) {
    pool = pool.filter((p) =>
      p.variants.some((v) => {
        if (!v.isActive || v.stock <= 0) return false
        if (u.sizes.length && !u.sizes.includes(v.size)) return false
        const color = p.colors.find((c) => c.id === v.colorId)
        return !hues.size || (!!color && [...huesOfColor(color)].some((h) => hues.has(h)))
      }),
    )
  }
  const type = u.garments.map((g) => g.word).join(', ')
  const parts = [
    u.colors.length ? `${[...hues].map((h) => HUE_LABELS[h]).join('/')} өнгөтэй` : '',
    u.sizes.length ? `${u.sizes.map(sizeLabel).join('/')} хэмжээтэй бэлэн` : '',
    u.audience === 'women' ? 'эмэгтэй' : u.audience === 'men' ? 'эрэгтэй' : '',
    tags.length && !notes.length ? `${tags.map((t) => TAG_LABELS[t].toLowerCase()).join(', ')} тохирох` : '',
    type || 'бараа',
  ].filter(Boolean)
  const limit = u.maxPrice !== null ? `${money(u.maxPrice)}-өөс доош ` : u.minPrice !== null ? `${money(u.minPrice)}-өөс дээш ` : ''
  const described = `${limit}${parts.join(' ')}`
  if (pool.length === 0) {
    const base = typed.length ? typed : tc.catalog
    const cheapest = [...base].sort((a, b) => a.minPrice - b.minPrice)[0]
    return {
      text: `Уучлаарай, ${described} одоогоор олдсонгүй.${cheapest && u.maxPrice !== null ? ` Хамгийн хямд нь ${link(cheapest)} — ${money(cheapest.minPrice)}.` : ''} Шүүлтүүрээ өөрчлөөд асуух уу?`,
      productIds: cheapest && u.maxPrice !== null ? [cheapest.id] : [],
      actions: [{ type: 'link', href: '/shop', label: 'Бүх бараа' }],
      suggestions: ['Ямар бараа байна?'],
      events: ['search', 'not_in_catalogue'],
    }
  }
  if (u.cheapest || u.priciest) pool = [...pool].sort((a, b) => (u.cheapest ? a.minPrice - b.minPrice : b.minPrice - a.minPrice))
  const heading = u.cheapest
    ? `Хамгийн хямд нь: ${link(pool[0])} — **${money(pool[0].minPrice)}**.`
    : u.priciest
      ? `Хамгийн үнэтэй нь: ${link(pool[0])} — **${money(pool[0].minPrice)}**.`
      : `${described.charAt(0).toUpperCase()}${described.slice(1)} (${pool.length}):`
  const list = listAnswer(tc, pool, `${heading}${notes.length ? `\n(${notes.join('; ')})` : ''}`)
  return { ...list, events: u.topics.includes('recommend') ? ['recommendation', 'search'] : ['search'] }
}

function fallbackAnswer(tc: ToolContext, u: Understood, focusProduct: CatalogProduct | null, state: ChatState): Answer {
  const again = (state.unanswered ?? 0) >= 1
  const looksLikeProduct = u.buy || u.topics.includes('stock') || u.topics.includes('price')
  const lines = [
    looksLikeProduct ? 'Уучлаарай, ийм бараа манай сангаас олдсонгүй.' : 'Уучлаарай, энэ асуултад дэлгүүрийн сангаас баттай хариулт олдсонгүй — таамаглаж хэлэхгүй.',
    looksLikeProduct ? `Манайд: ${tc.categories.map((c) => c.name.toLowerCase()).join(', ')} байна.` : '',
    focusProduct ? `${link(focusProduct)}-ийн үнэ, өнгө, хэмжээ, үлдэгдэл, материалын талаар асууж болно.` : 'Бараа, өнгө, хэмжээ, үлдэгдэл, үнэ, хүргэлт, буцаалтын талаар асууж болно.',
    again ? 'Хүн хэрэгтэй бол «ажилтантай холбогдох» гэж бичээрэй — яриаг ажилтанд шилжүүлнэ.' : '',
  ].filter(Boolean)
  return {
    text: lines.join('\n'),
    productIds: [],
    actions: [],
    suggestions: again ? ['Ажилтантай холбогдох', 'Ямар бараа байна?'] : ['Ямар бараа байна?', 'Хүргэлт хэд хоног вэ?', 'Ажилтантай холбогдох'],
    events: looksLikeProduct ? ['unanswered', 'not_in_catalogue'] : ['unanswered'],
  }
}
