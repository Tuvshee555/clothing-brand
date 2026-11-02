// Purchase intent and the chat order draft — the clothing adaptation of the
// Lorentz purchase flow (commerce/purchase.ts at 69e4110).
//
// "Хар hoodie L авъя" starts a purchase: the product (named, picked from the
// last list, or the one in focus), its exact colour and size and the quantity
// are settled, stock is checked, and the customer gets a server-priced offer
// with an "add to cart" button. "Энд захиалъя" continues in the chat: name and
// phone, delivery address, then a full summary the customer must confirm with
// "тийм" before the order is created — once, through the store's own checkout
// core. Totals always come from the database, never from the customer or a
// model, and nothing is ever described as paid.
//
// Pure: state in, reply and state patch out. The order and cart services are injected.
import { sizeLabel } from '@/lib/catalog'
import type { CatalogProduct, CatalogVariant } from '@/lib/catalog-filter'
import type { ChatAction } from '@/lib/assistant/types'
import type { HandoffReason } from '@/lib/chat/handover'
import { parseName, parsePhone, parseNumberedChoice } from '@/lib/chat/intents'
import { reservationPolicy, reservationWindowText } from '@/lib/chat/reservation'
import { shippingFeeFor } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { PROVINCES, UB_DISTRICTS } from '@/lib/regions'
import { link, money, variantQuery, type Answer, type Focus } from './answers'
import type { ToolContext } from './tools'
import type { Understood } from './understand'

export const DRAFT_TTL_MS = 30 * 60 * 1000

export interface OrderDraft {
  /** Stable for the life of the draft: the order's idempotency key is built from it. */
  id: string
  step: 'product' | 'variant' | 'offer' | 'contact' | 'address' | 'confirm'
  productId?: string
  colorId?: string | null
  size?: string | null
  quantity: number
  name?: string
  phone?: string
  shipping?: string
  district?: string
  address?: string
  /** The total shown in the summary; a price change in between is caught at creation. */
  expectedTotal?: number
  createdAt: number
  updatedAt: number
}

export interface ChatOrderRequest {
  conversationId: string
  draftId: string
  variantId: string
  quantity: number
  name: string
  phone: string
  shippingMethod: string
  district: string
  address: string
  expectedTotal: number
}

export interface ChatOrderResult {
  number: string
  total: number
  subtotal: number
  shippingFee: number
  expiresAt: string | null
  reservationMinutes: number
  /** The same draft was already ordered: this is that order, not a new one. */
  duplicate?: boolean
  /** Admin test chat: nothing was created. */
  simulated?: boolean
}

export type PlaceChatOrder = (request: ChatOrderRequest) => Promise<ChatOrderResult>
export type AddToCart = (variantId: string, quantity: number) => Promise<{ itemCount: number; simulated?: boolean }>

export interface PurchaseInput {
  u: Understood
  tc: ToolContext
  draft: OrderDraft | null
  focus: Focus | null
  /** The product the message itself resolved (named or picked from the last list). */
  product: CatalogProduct | null
  /** Several products fit the words ("жинс"): ask which instead of guessing. */
  ambiguous: CatalogProduct[]
  conversationId: string
  now: number
  randomId: () => string
  placeOrder: PlaceChatOrder | null
  addToCart: AddToCart | null
}

export interface PurchaseOutcome extends Answer {
  intent: string
  draft: OrderDraft | null
  handoff?: HandoffReason
  orderNumber?: string
  cartChanged?: boolean
}

// ---------------------------------------------------------------------------

export function readDraft(value: unknown, now: number): OrderDraft | null {
  const d = value as OrderDraft | null | undefined
  if (!d || typeof d !== 'object' || typeof d.step !== 'string' || typeof d.id !== 'string') return null
  if (!Number.isFinite(d.updatedAt) || now - d.updatedAt > DRAFT_TTL_MS) return null
  return { ...d, quantity: Number.isInteger(d.quantity) && d.quantity > 0 ? d.quantity : 1 }
}

function variantOf(p: CatalogProduct, colorId?: string | null, size?: string | null): CatalogVariant | undefined {
  return p.variants.find((v) => v.colorId === colorId && v.size === size)
}
const colorName = (p: CatalogProduct, colorId?: string | null) => p.colors.find((c) => c.id === colorId)?.name ?? ''
const sellable = (v: CatalogVariant | undefined): boolean => !!v && v.isActive && v.stock > 0

function outcome(partial: Partial<PurchaseOutcome> & { text: string; intent: string; draft: OrderDraft | null }): PurchaseOutcome {
  return { productIds: [], actions: [], suggestions: [], events: [], ...partial }
}

function variantLabel(p: CatalogProduct, d: OrderDraft): string {
  return `${p.name} — ${colorName(p, d.colorId)} / ${sizeLabel(d.size ?? '')}`
}

function focusOf(p: CatalogProduct, d: OrderDraft, now: number): Focus {
  return { productId: p.id, colorId: d.colorId ?? null, size: d.size ?? null, at: now }
}

/** Ask for whichever of colour and size is still missing, listing what is in stock. */
function askVariant(input: PurchaseInput, p: CatalogProduct, d: OrderDraft, preface?: string): PurchaseOutcome {
  const lines: string[] = preface ? [preface] : []
  if (!d.colorId && p.colors.length > 1) {
    lines.push(`${link(p)} — ямар өнгөөр авах вэ?`)
    for (const [i, c] of p.colors.entries()) {
      const sizes = p.variants.filter((v) => v.colorId === c.id && sellable(v)).map((v) => sizeLabel(v.size))
      lines.push(`${i + 1}) ${c.name}: ${sizes.join(', ') || 'дууссан'}`)
    }
  } else {
    const colorId = d.colorId ?? p.colors[0]?.id
    lines.push(`${link(p)}${colorName(p, colorId) ? ` (${colorName(p, colorId)})` : ''} — ямар размер авах вэ?`)
    for (const v of p.variants.filter((x) => x.colorId === colorId)) {
      lines.push(`- ${sizeLabel(v.size)}: ${sellable(v) ? (input.tc.settings.showExactStock ? `${v.stock} ширхэг` : 'бэлэн') : 'дууссан'}`)
    }
  }
  return outcome({
    text: lines.join('\n'),
    intent: 'purchase',
    draft: { ...d, step: 'variant', colorId: d.colorId ?? (p.colors.length === 1 ? p.colors[0].id : null), updatedAt: input.now },
    productIds: [p.id],
    events: [],
    focus: focusOf(p, d, input.now),
  })
}

/** The colour/size the message names for this product (colour by name or hue, size by label). */
function pickVariant(input: PurchaseInput, p: CatalogProduct, d: OrderDraft): { colorId: string | null; size: string | null; unknown: string | null } {
  const q = variantQuery(p, input.u, input.focus)
  // What the conversation already settled ("Хар / L … авъя") counts unless the message changes it.
  const memory = input.focus?.productId === p.id ? input.focus : null
  let colorId = q.colors.length === 1 ? q.colors[0].id : (d.colorId ?? (q.unknownColors.length ? null : (memory?.colorId ?? null)))
  let size = q.sizes.length === 1 ? q.sizes[0] : (d.size ?? (q.unknownSizes.length ? null : (memory?.size ?? null)))
  // A numbered pick answers the question that was asked (colour first, then size).
  const pick = input.u.numbered
  if (pick && q.colors.length === 0 && q.sizes.length === 0) {
    if (!colorId && p.colors.length > 1 && p.colors[pick.index]) colorId = p.colors[pick.index].id
    else if (colorId && !size) {
      const sizes = p.variants.filter((v) => v.colorId === colorId).map((v) => v.size)
      if (sizes[pick.index]) size = sizes[pick.index]
    }
  }
  if (!colorId && p.colors.length === 1) colorId = p.colors[0].id
  if (!size && p.sizes.length === 1) size = p.sizes[0]
  const unknown = q.unknownColors.length ? `${q.unknownColors.map((c) => c.phrase).join(', ')} өнгө` : q.unknownSizes.length ? `${q.unknownSizes.map(sizeLabel).join(', ')} хэмжээ` : null
  return { colorId, size, unknown }
}

/** Offer for an exact variant: stock checked, server-priced, with the cart button and the chat-order option. */
function offer(input: PurchaseInput, p: CatalogProduct, d: OrderDraft, events: string[]): PurchaseOutcome {
  const v = variantOf(p, d.colorId, d.size)
  const cap = reservationPolicy(input.tc.settings).maxQuantityPerItem
  if (!v || !sellable(v)) {
    const others = p.variants.filter((x) => sellable(x) && x.id !== v?.id)
    const sameColor = others.filter((x) => x.colorId === d.colorId).map((x) => sizeLabel(x.size))
    const sameSize = others.filter((x) => x.size === d.size).map((x) => colorName(p, x.colorId))
    const lines = [`Уучлаарай, ${variantLabel(p, d)} ${v ? 'дууссан' : 'гэсэн хувилбар байхгүй'} байна.`]
    if (sameColor.length) lines.push(`${colorName(p, d.colorId)} өнгөөр байгаа: ${sameColor.join(', ')}.`)
    if (sameSize.length) lines.push(`${sizeLabel(d.size ?? '')} хэмжээ бусад өнгөөр: ${sameSize.join(', ')}.`)
    if (!others.length) lines.push('Энэ барааны бүх хувилбар одоогоор дууссан. Өөр бараа санал болгох уу?')
    else lines.push('Аль хувилбарыг авах вэ?')
    return outcome({
      text: lines.join('\n'),
      intent: 'purchase',
      draft: others.length ? { ...d, step: 'variant', size: sameColor.length ? null : d.size, colorId: sameColor.length ? d.colorId : null, updatedAt: input.now } : null,
      productIds: [p.id],
      events: [...events, 'variant_unavailable'],
      focus: focusOf(p, d, input.now),
    })
  }
  if (d.quantity > v.stock) {
    return outcome({
      text: `${variantLabel(p, d)}: үлдэгдэл ${v.stock} ширхэг байна. Хэдэн ширхэг авах вэ? (хамгийн ихдээ ${Math.min(v.stock, cap)})`,
      intent: 'purchase',
      draft: { ...d, step: 'offer', updatedAt: input.now },
      productIds: [p.id],
      events,
      focus: focusOf(p, d, input.now),
    })
  }
  const subtotal = v.price * d.quantity
  const standard = input.tc.shipping.find((m) => m.region === 'ub' && m.freeThreshold !== null) ?? input.tc.shipping[0]
  const fee = standard ? shippingFeeFor(subtotal, standard) : 0
  const lines = [
    `**${variantLabel(p, d)}**`,
    `${d.quantity} ширхэг × ${money(v.price)} = **${money(subtotal)}**`,
    standard ? `Хүргэлт: ${standard.name} ${fee === 0 ? 'үнэгүй' : money(fee)}${standard.freeThreshold && fee > 0 ? ` (${money(standard.freeThreshold)}-өөс дээш бол үнэгүй)` : ''}.` : '',
    'Доорх товчоор сагсандаа нэмээд сайтаар захиалж болно.',
    input.tc.settings.chatOrdersEnabled ? 'Эсвэл энд чатаар захиалах бол «энд захиалъя» гэж бичнэ үү.' : '',
  ].filter(Boolean)
  const actions: ChatAction[] = [
    { type: 'add_to_cart', variantId: v.id, quantity: d.quantity, label: `Сагсанд нэмэх · ${colorName(p, d.colorId)} / ${sizeLabel(v.size)}` },
    { type: 'link', href: `/products/${p.slug}`, label: 'Барааны хуудас' },
  ]
  return outcome({
    text: lines.join('\n'),
    intent: 'purchase',
    draft: { ...d, step: 'offer', updatedAt: input.now },
    productIds: [p.id],
    actions,
    suggestions: input.tc.settings.chatOrdersEnabled ? ['Энд захиалъя', 'Хүргэлт хэд хоног вэ?'] : ['Хүргэлт хэд хоног вэ?'],
    events: [...events, 'offer'],
    focus: focusOf(p, d, input.now),
  })
}

async function addToCartNow(input: PurchaseInput, p: CatalogProduct, d: OrderDraft): Promise<PurchaseOutcome> {
  const v = variantOf(p, d.colorId, d.size)
  if (!v || !sellable(v) || d.quantity > v.stock || !input.addToCart) return offer(input, p, d, [])
  try {
    const result = await input.addToCart(v.id, d.quantity)
    return outcome({
      text: [
        `Сагсанд нэмлээ: **${variantLabel(p, d)}** × ${d.quantity}${result.simulated ? ' (туршилтын чат — сагс өөрчлөгдөөгүй)' : ''}.`,
        `Сагсанд нийт ${result.itemCount} бараа байна. Захиалахдаа [сагс](/cart) руу орж «Захиалах» дарна уу.`,
      ].join('\n'),
      intent: 'added_to_cart',
      draft: null,
      productIds: [p.id],
      actions: [
        { type: 'link', href: '/cart', label: 'Сагс үзэх' },
        { type: 'link', href: '/checkout', label: 'Захиалах' },
      ],
      suggestions: ['Хүргэлт хэд хоног вэ?'],
      events: ['added_to_cart'],
      focus: focusOf(p, d, input.now),
      cartChanged: !result.simulated,
    })
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : 'Сагсанд нэмж чадсангүй.'
    return outcome({ text: `${message} Өөр хэмжээ, өнгө сонгох уу?`, intent: 'purchase', draft: { ...d, step: 'variant', updatedAt: input.now }, productIds: [p.id], events: ['add_to_cart_failed'] })
  }
}

function contactPrompt(input: PurchaseInput, p: CatalogProduct, d: OrderDraft): PurchaseOutcome {
  if (!input.tc.settings.chatOrdersEnabled || !input.placeOrder) {
    return { ...offer(input, p, d, []), text: 'Чатаар захиалга одоогоор хаалттай. Доорх товчоор сагсандаа нэмээд сайтаар захиална уу.' }
  }
  return outcome({
    text: 'За, энд захиалъя. Нэр, утасны дугаараа бичнэ үү (жишээ: Бат 9911 2233).\nДемо дэлгүүр тул зохиомол нэр, дугаар ашиглаарай.',
    intent: 'chat_order',
    draft: { ...d, step: 'contact', updatedAt: input.now },
    productIds: [p.id],
    events: ['chat_order_started'],
  })
}

const ADDRESS_PROMPT = 'Хүргэлтийн хаягаа бичнэ үү: дүүрэг, хороо, байр, орц, тоот (орон нутаг бол аймаг, сум, хаяг). Шуурхай хүргэлт хүсвэл «шуурхай» гэж нэмээрэй.'

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const LATIN_DISTRICTS: [RegExp, string][] = [
  [/bayanzurh|bayanzurkh|\bbzd\b/i, 'Баянзүрх'], [/bayangol|\bbgd\b/i, 'Баянгол'], [/songino|\bshd\b/i, 'Сонгинохайрхан'], [/suhbaatar|sukhbaatar|\bsbd\b/i, 'Сүхбаатар'],
  [/han\s*-?\s*uul|khan\s*-?\s*uul|\bhud\b/i, 'Хан-Уул'], [/chingeltei|\bchd\b/i, 'Чингэлтэй'], [/nalaih|nalaikh/i, 'Налайх'], [/baganuur/i, 'Багануур'], [/bagahangai/i, 'Багахангай'],
]

/** A Ulaanbaatar district or a province named in free text. */
export function parseArea(text: string): { region: 'ub' | 'countryside'; area: string } | null {
  const flat = squash(text)
  const rural = /аймаг|орон\s*нутаг|aimag|oron\s*nutag|(?:^|\s)сум(?:\s|$)/iu.test(text)
  if (!rural) {
    for (const d of UB_DISTRICTS) if (flat.includes(squash(d))) return { region: 'ub', area: d }
    for (const [re, d] of LATIN_DISTRICTS) if (re.test(text)) return { region: 'ub', area: d }
  }
  for (const p of PROVINCES) if (flat.includes(squash(p))) return { region: 'countryside', area: p }
  if (rural) for (const d of UB_DISTRICTS) if (d === 'Сүхбаатар' && flat.includes(squash(d))) return { region: 'countryside', area: 'Сүхбаатар' }
  return null
}

function shippingFor(input: PurchaseInput, region: 'ub' | 'countryside', current?: string): string | undefined {
  const probe = input.u.probe
  const methods = input.tc.shipping
  if (region === 'countryside') return methods.find((m) => m.region === 'countryside')?.code
  if (/(?:шуурхай|express|тухайн\s+өдөр|өнөөдөр)/iu.test(probe)) return methods.find((m) => m.region === 'ub' && m.freeThreshold === null)?.code ?? current
  if (/(?:энгийн|standard)/iu.test(probe)) return methods.find((m) => m.region === 'ub' && m.freeThreshold !== null)?.code ?? current
  const keep = methods.find((m) => m.code === current && m.region === region)
  return keep?.code ?? methods.find((m) => m.region === region)?.code
}

function priced(input: PurchaseInput, p: CatalogProduct, d: OrderDraft) {
  const v = variantOf(p, d.colorId, d.size)
  const method = input.tc.shipping.find((m) => m.code === d.shipping)
  if (!v || !method) return null
  const subtotal = v.price * d.quantity
  const fee = shippingFeeFor(subtotal, method)
  return { v, method, subtotal, fee, total: subtotal + fee }
}

function summary(input: PurchaseInput, p: CatalogProduct, d: OrderDraft): PurchaseOutcome {
  const price = priced(input, p, d)
  if (!price) return outcome({ text: ADDRESS_PROMPT, intent: 'chat_order', draft: { ...d, step: 'address', updatedAt: input.now } })
  const policy = reservationPolicy(input.tc.settings)
  const lines = [
    '**Захиалгын мэдээлэл:**',
    `- ${variantLabel(p, d)} × ${d.quantity} — ${money(price.subtotal)}`,
    `- Хүргэлт: ${price.method.name} — ${price.fee === 0 ? 'үнэгүй' : money(price.fee)} (${price.method.eta})`,
    `- **Нийт: ${money(price.total)}**`,
    `- Нэр: ${d.name}`,
    `- Утас: ${formatPhone(d.phone)}`,
    `- Хаяг: ${d.address?.includes(d.district ?? '') ? d.address : `${d.district}, ${d.address}`}`,
    `- Төлбөр: QPay — демо симуляц, бодит мөнгө шилжихгүй. ${reservationWindowText(policy.minutes)} дотор төлөөгүй бол захиалга цуцлагдаж, бараа чөлөөлөгдөнө.`,
    '',
    'Баталгаажуулах уу? «Тийм» гэж бичнэ үү. Засах бол зөв мэдээллээ бичээрэй, болих бол «Үгүй».',
  ]
  return outcome({
    text: lines.join('\n'),
    intent: 'chat_order',
    draft: { ...d, step: 'confirm', expectedTotal: price.total, updatedAt: input.now },
    productIds: [p.id],
    suggestions: ['Тийм', 'Үгүй'],
    events: ['chat_order_summary'],
  })
}

const cancel = (input: PurchaseInput, productIds: string[]): PurchaseOutcome =>
  outcome({ text: 'За, захиалгыг цуцаллаа. Хүссэн үедээ дахин захиалж болно.', intent: 'purchase_cancelled', draft: null, productIds, events: ['chat_order_cancelled'] })

async function create(input: PurchaseInput, p: CatalogProduct, d: OrderDraft): Promise<PurchaseOutcome> {
  const price = priced(input, p, d)
  if (!input.placeOrder || !price || !d.name || !d.phone || !d.district || !d.address) return summary(input, p, d)
  try {
    const result = await input.placeOrder({
      conversationId: input.conversationId,
      draftId: d.id,
      variantId: price.v.id,
      quantity: d.quantity,
      name: d.name,
      phone: d.phone,
      shippingMethod: price.method.code,
      district: d.district,
      address: d.address,
      expectedTotal: d.expectedTotal ?? price.total,
    })
    const window = reservationWindowText(result.reservationMinutes)
    const lines = result.simulated
      ? [`Туршилтын захиалга: №${result.number} (админы туршилтын чат — захиалга үүсээгүй, үлдэгдэл өөрчлөгдөөгүй).`, `Нийт: ${money(result.total)}.`]
      : [
          result.duplicate ? `Энэ захиалга аль хэдийн бүртгэгдсэн: **№${result.number}**.` : `Захиалга бүртгэгдлээ: **№${result.number}**.`,
          `Нийт: **${money(result.total)}** (хүргэлт ${result.shippingFee === 0 ? 'үнэгүй' : money(result.shippingFee)}).`,
          `Төлбөрөө [захиалгын хуудаснаас](/orders/${result.number}) QPay-ээр хийнэ үү — демо симуляц, бодит мөнгө шилжихгүй.`,
          `${window} дотор төлөөгүй бол захиалга автоматаар цуцлагдаж, бараа чөлөөлөгдөнө.`,
          'Захиалгынхаа явцыг [Миний захиалга](/orders) хуудаснаас, эсвэл энд дугаараар нь асууж шалгана.',
        ]
    return outcome({
      text: lines.join('\n'),
      intent: 'chat_order_created',
      draft: null,
      productIds: [p.id],
      actions: result.simulated ? [] : [{ type: 'link', href: `/orders/${result.number}`, label: `Захиалга №${result.number}` }],
      events: [result.duplicate ? 'chat_order_duplicate' : 'chat_order_created'],
      orderNumber: result.number,
    })
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    const details = (err as { details?: Record<string, unknown> }).details ?? {}
    if (code === 'stock_changed' || code === 'insufficient_stock') {
      return { ...offer(input, p, { ...d, step: 'offer' }, ['chat_order_failed']), text: `Уучлаарай, энэ хооронд ${variantLabel(p, d)}-ийн үлдэгдэл өөрчлөгдсөн тул захиалга үүссэнгүй. Өөр хэмжээ, өнгө сонгох уу?` }
    }
    if (code === 'total_changed') {
      const again = summary(input, p, d)
      return { ...again, text: `Үнэ эсвэл хүргэлтийн төлбөр өөрчлөгдсөн байна. Шинэ дүнгээр шалгана уу:\n\n${again.text}`, events: ['chat_order_failed', 'chat_order_summary'] }
    }
    if (code === 'reservation_limit') {
      const number = typeof details.number === 'string' ? details.number : null
      return outcome({
        text: [
          `Танд төлбөр хүлээгдэж буй чат захиалга${number ? ` №${number}` : ''} байна. Шинэ захиалга үүсгэхийн өмнө түүнийгээ төлөх эсвэл хугацаа нь дуусахыг хүлээнэ үү.`,
          number ? `[Захиалга №${number}](/orders/${number})` : '',
          'Өөрчлөх бол «ажилтантай холбогдох» гэж бичээрэй.',
        ].filter(Boolean).join('\n'),
        intent: 'chat_order_failed',
        draft: null,
        productIds: [p.id],
        actions: number ? [{ type: 'link', href: `/orders/${number}`, label: `Захиалга №${number}` }] : [],
        events: ['chat_order_failed', 'reservation_limit'],
      })
    }
    if (code === 'quantity_limit') {
      return outcome({
        text: `Чатаар нэг бараанаас хамгийн ихдээ ${reservationPolicy(input.tc.settings).maxQuantityPerItem} ширхэг захиална. Их тоогоор авах бол сагсаар захиалах эсвэл ажилтантай холбогдоорой.`,
        intent: 'chat_order_failed',
        draft: { ...d, step: 'offer', updatedAt: input.now },
        productIds: [p.id],
        handoff: 'bulk_order',
        events: ['chat_order_failed', 'bulk_quantity'],
      })
    }
    if (code === 'rate_limited') {
      return outcome({ text: 'Хэт олон захиалга оролдлоо. Түр хүлээгээд «тийм» гэж дахин бичнэ үү.', intent: 'chat_order_failed', draft: d, productIds: [p.id], events: ['chat_order_failed'] })
    }
    return outcome({
      text: 'Уучлаарай, захиалгыг одоо үүсгэж чадсангүй. Сагсаар захиалах эсвэл ажилтантай холбогдоно уу — яриаг ажилтанд шилжүүллээ.',
      intent: 'chat_order_failed',
      draft: null,
      productIds: [p.id],
      handoff: 'order_problem',
      actions: [{ type: 'link', href: `/products/${p.slug}`, label: 'Барааны хуудас' }],
      events: ['chat_order_failed'],
    })
  }
}

/** Starts (or restarts) a purchase. */
async function start(input: PurchaseInput, p: CatalogProduct | null, quantity: number): Promise<PurchaseOutcome> {
  const draft: OrderDraft = { id: input.randomId(), step: 'product', quantity, createdAt: input.now, updatedAt: input.now }
  if (!p) {
    const choices = input.ambiguous.length > 1 ? input.ambiguous : []
    if (choices.length) {
      return outcome({
        text: ['Аль барааг авах вэ?', ...choices.slice(0, 6).map((c, i) => `${i + 1}) ${link(c)} — ${money(c.minPrice)}`)].join('\n'),
        intent: 'purchase',
        draft,
        productIds: choices.slice(0, 6).map((c) => c.id),
        candidates: choices.slice(0, 6).map((c) => c.id),
        events: ['purchase_intent'],
      })
    }
    return outcome({
      text: 'Аль барааг авах вэ? Барааны нэр эсвэл төрлийг бичээрэй (жишээ: «хар hoodie L авъя»), эсвэл барааны хуудсан дээрээс надаас асуугаарай.',
      intent: 'purchase',
      draft,
      events: ['purchase_intent'],
    })
  }
  const d: OrderDraft = { ...draft, productId: p.id }
  const picked = pickVariant(input, p, d)
  const next: OrderDraft = { ...d, colorId: picked.colorId, size: picked.size }
  if (picked.unknown) return askVariant(input, p, { ...next, colorId: picked.unknown.endsWith('өнгө') ? null : next.colorId, size: picked.unknown.endsWith('хэмжээ') ? null : next.size }, `${p.name} ${picked.unknown}гүй.`)
  if (!next.colorId || !next.size) return { ...askVariant(input, p, next), events: ['purchase_intent'] }
  const offered = offer(input, p, next, ['purchase_intent'])
  if (input.u.addToCart && offered.events.includes('offer')) return addToCartNow(input, p, next)
  if (input.u.chatHere && offered.events.includes('offer')) return contactPrompt(input, p, offered.draft!)
  return offered
}

/** Continues an active draft; null means the message was about something else (the draft stays). */
async function continueDraft(input: PurchaseInput, d: OrderDraft): Promise<PurchaseOutcome | null> {
  const { u, tc } = input
  const p = d.productId ? tc.catalog.find((x) => x.id === d.productId) ?? null : null
  if (d.step !== 'product' && !p) return null
  // Another product named with purchase intent restarts the purchase.
  if (u.buy && input.product && input.product.id !== d.productId) return null

  if (d.step === 'product') {
    if (u.no) return cancel(input, [])
    if (!input.product) return null
    return start(input, input.product, u.quantity ?? d.quantity)
  }
  if (!p) return null
  const q = variantQuery(p, u, input.focus)
  const mentionsVariant = q.colors.length > 0 || q.sizes.length > 0 || q.unknownColors.length > 0 || q.unknownSizes.length > 0

  if (d.step === 'variant') {
    if (u.no) return cancel(input, [p.id])
    if (!mentionsVariant && !u.numbered && !u.quantity) return null
    const picked = pickVariant(input, p, d)
    const next: OrderDraft = { ...d, colorId: picked.colorId, size: picked.size, quantity: u.quantity ?? d.quantity, updatedAt: input.now }
    if (picked.unknown) return askVariant(input, p, next, `${p.name} ${picked.unknown}гүй.`)
    if (!next.colorId || !next.size) return askVariant(input, p, next)
    const offered = offer(input, p, next, [])
    if (u.addToCart && offered.events.includes('offer')) return addToCartNow(input, p, next)
    return offered
  }
  if (d.step === 'offer') {
    if (u.no) return cancel(input, [p.id])
    if (u.addToCart) return addToCartNow(input, p, d)
    if (u.chatHere) return contactPrompt(input, p, d)
    if (mentionsVariant || u.quantity) {
      const picked = pickVariant(input, p, d)
      return offer(input, p, { ...d, colorId: picked.colorId, size: picked.size, quantity: u.quantity ?? d.quantity, updatedAt: input.now }, [])
    }
    if (u.yes || u.buy) {
      return outcome({
        text: 'Сагсаар захиалах бол дээрх «Сагсанд нэмэх» товчийг дарна уу. Энд чатаар захиалах бол «энд захиалъя» гэж бичээрэй.',
        intent: 'purchase',
        draft: { ...d, updatedAt: input.now },
        productIds: [p.id],
        suggestions: ['Энд захиалъя', 'Сагсанд нэм'],
      })
    }
    return null
  }
  if (d.step === 'contact') {
    if (u.no) return cancel(input, [p.id])
    const phone = parsePhone(u.raw) ?? d.phone ?? null
    const name = parseName(u.raw) || d.name || ''
    if (!phone) {
      if (/\d{4,}/.test(u.raw)) return outcome({ text: 'Утасны дугаар 8 оронтой байна (жишээ: 9911 2233). Дахин бичнэ үү.', intent: 'chat_order', draft: { ...d, name: name || d.name, updatedAt: input.now }, productIds: [p.id] })
      if (name && u.raw.trim().split(/\s+/).length <= 3 && !/[?？]/.test(u.raw) && !u.buy) {
        return outcome({ text: `${name}, утасны дугаараа бас бичнэ үү (8 оронтой).`, intent: 'chat_order', draft: { ...d, name, updatedAt: input.now }, productIds: [p.id] })
      }
      return null
    }
    if (!name) return outcome({ text: 'Нэрээ бас бичнэ үү.', intent: 'chat_order', draft: { ...d, phone, updatedAt: input.now }, productIds: [p.id] })
    return outcome({ text: ADDRESS_PROMPT, intent: 'chat_order', draft: { ...d, name, phone, step: 'address', updatedAt: input.now }, productIds: [p.id] })
  }
  if (d.step === 'address') {
    if (u.no) return cancel(input, [p.id])
    const area = parseArea(u.raw) ?? parseArea(u.norm)
    const looksLikeAddress = !!area || /(?:хороо|байр|тоот|орц|гудамж|хотхон|хороолол|сум|horoo|bair|toot|hothon)/iu.test(u.probe)
    if (!looksLikeAddress) return null
    const address = u.raw.trim().slice(0, 300)
    if (!area) {
      return outcome({
        text: `Аль дүүрэг вэ? (${UB_DISTRICTS.join(', ')}). Орон нутаг бол аймгаа бичнэ үү.`,
        intent: 'chat_order',
        draft: { ...d, address: address.length >= 8 ? address : d.address, updatedAt: input.now },
        productIds: [p.id],
      })
    }
    const fullAddress = address.length >= 8 ? address : d.address
    const next: OrderDraft = { ...d, district: area.area, shipping: shippingFor(input, area.region, d.shipping), address: fullAddress, updatedAt: input.now }
    if (!fullAddress || fullAddress.replace(/\s+/g, '').length < 8 || squash(fullAddress) === squash(area.area)) {
      return outcome({ text: `${area.area} — хороо, байр, орц, тоотоо бас бичнэ үү.`, intent: 'chat_order', draft: { ...next, address: undefined }, productIds: [p.id] })
    }
    return summary(input, p, next)
  }
  if (d.step === 'confirm') {
    if (u.yes) return create(input, p, d)
    if (u.no) return cancel(input, [p.id])
    // Corrections: a new phone, address, delivery speed, colour, size or quantity.
    let next: OrderDraft = { ...d, updatedAt: input.now }
    let changed = false
    const phone = parsePhone(u.raw)
    if (phone && phone !== d.phone) {
      next = { ...next, phone, name: parseName(u.raw) || d.name }
      changed = true
    }
    const area = parseArea(u.raw)
    if (area) {
      next = { ...next, district: area.area, shipping: shippingFor(input, area.region, d.shipping), address: u.raw.trim().length >= 8 ? u.raw.trim().slice(0, 300) : d.address }
      changed = true
    } else if (/(?:шуурхай|express|энгийн|standard)/iu.test(u.probe)) {
      const region = tc.shipping.find((m) => m.code === d.shipping)?.region === 'countryside' ? 'countryside' : 'ub'
      next = { ...next, shipping: shippingFor(input, region, d.shipping) }
      changed = true
    }
    if (mentionsVariant || u.quantity) {
      const picked = pickVariant(input, p, d)
      const variantNext: OrderDraft = { ...next, colorId: picked.colorId, size: picked.size, quantity: u.quantity ?? d.quantity }
      const check = offer(input, p, variantNext, [])
      if (!check.events.includes('offer')) return check
      next = variantNext
      changed = true
    }
    if (changed) return summary(input, p, next)
    return null
  }
  return null
}

/** The purchase layer of a turn. Null = not a purchase turn (any draft stays as it was). */
export async function purchaseTurn(input: PurchaseInput): Promise<PurchaseOutcome | null> {
  const { u } = input
  if (input.draft) {
    const continued = await continueDraft(input, input.draft)
    if (continued) return continued
  }
  if (!u.buy && !u.chatHere) return null
  const p = input.product ?? (input.ambiguous.length > 1 ? null : input.focus ? input.tc.catalog.find((x) => x.id === input.focus!.productId) ?? null : null)
  return start(input, p, u.quantity ?? 1)
}

/** Picks a candidate by number ("2") for the purchase layer and routing alike. */
export function pickCandidate(text: string, candidates: CatalogProduct[]): CatalogProduct | null {
  const pick = parseNumberedChoice(text)
  if (!pick) return null
  const index = pick.index < 0 ? candidates.length - 1 : pick.index
  return candidates[index] ?? null
}
