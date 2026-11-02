// Deterministic answers composed only from database rows (the ToolContext):
// prices with per-size overrides, exact colour × size stock with alternatives,
// colours, sizes, material, care, fit, the owner's size chart, comparisons,
// lists and store policies. Nothing here can state a fact the database lacks.
import { matchColors, type ColorMention } from '@/lib/assistant/fashion'
import type { ChatAction } from '@/lib/assistant/types'
import { AVAILABILITY_LABELS, compareSizes, sizeLabel, variantAvailability } from '@/lib/catalog'
import { availabilityOf, type CatalogColor, type CatalogProduct, type CatalogVariant } from '@/lib/catalog-filter'
import { formatMoney } from '@/lib/money'
import { POLICY_SLUGS } from '@/lib/settings'
import type { ToolContext } from './tools'
import type { PolicyTopic, Understood } from './understand'

export interface Focus {
  productId: string
  colorId?: string | null
  size?: string | null
  at: number
}

export interface Answer {
  text: string
  productIds: string[]
  actions: ChatAction[]
  suggestions: string[]
  events: string[]
  /** The product (and colour/size) this answer settled on, for follow-ups. */
  focus?: Focus | null
  /** A numbered list the next message can pick from ("2"). */
  candidates?: string[]
}

export const money = formatMoney
export const link = (p: { name: string; slug: string }) => `[${p.name}](/products/${p.slug})`
const quote = (p: { name: string }) => `«${p.name}»`

function priceRange(p: CatalogProduct): string {
  return p.minPrice === p.maxPrice ? money(p.minPrice) : `${money(p.minPrice)}–${money(p.maxPrice)}`
}

function colorOf(p: CatalogProduct, v: CatalogVariant): CatalogColor | undefined {
  return p.colors.find((c) => c.id === v.colorId)
}

const sellable = (v: CatalogVariant) => v.isActive && v.stock > 0

/** "5 ширхэг байна" / "цөөн үлдсэн (2 ширхэг)" / "дууссан" — exact counts only when the owner shows them. */
export function stockPhrase(tc: ToolContext, v: CatalogVariant): string {
  const a = variantAvailability(v)
  if (a === 'unavailable') return 'худалдаанд байхгүй'
  if (a === 'out_of_stock') return 'дууссан'
  if (!tc.settings.showExactStock) return a === 'low_stock' ? 'цөөн үлдсэн' : 'бэлэн байгаа'
  return a === 'low_stock' ? `цөөн үлдсэн (${v.stock} ширхэг)` : `${v.stock} ширхэг байна`
}

function shortStock(tc: ToolContext, v: CatalogVariant): string {
  if (!sellable(v)) return 'дууссан'
  return tc.settings.showExactStock ? `${v.stock} ш` : variantAvailability(v) === 'low_stock' ? 'цөөн' : 'бэлэн'
}

function variantsOf(p: CatalogProduct, colorId?: string | null, size?: string | null): CatalogVariant[] {
  return p.variants
    .filter((v) => (!colorId || v.colorId === colorId) && (!size || v.size === size))
    .sort((a, b) => compareSizes(a.size, b.size))
}

/** "M (4 ш), L (5 ш)" for one colour's sellable sizes. */
function sizesInStock(tc: ToolContext, p: CatalogProduct, colorId: string): string {
  return variantsOf(p, colorId)
    .filter(sellable)
    .map((v) => `${sizeLabel(v.size)} (${shortStock(tc, v)})`)
    .join(', ')
}

function soldOutSizes(p: CatalogProduct, colorId: string): string[] {
  return variantsOf(p, colorId)
    .filter((v) => v.isActive && v.stock <= 0)
    .map((v) => sizeLabel(v.size))
}

function addToCartAction(p: CatalogProduct, v: CatalogVariant, quantity = 1): ChatAction {
  const color = colorOf(p, v)
  return { type: 'add_to_cart', variantId: v.id, quantity, label: `Сагсанд нэмэх · ${color?.name ?? ''} / ${sizeLabel(v.size)}` }
}

const pageAction = (p: CatalogProduct): ChatAction => ({ type: 'link', href: `/products/${p.slug}`, label: 'Барааны хуудас' })

// ---------------------------------------------------------------------------
// Which colour / size a message means for one product
// ---------------------------------------------------------------------------

export interface VariantQuery {
  colors: CatalogColor[]
  /** Colours the customer named that this product does not come in. */
  unknownColors: ColorMention[]
  sizes: string[]
  /** Sizes the customer named that this product does not come in. */
  unknownSizes: string[]
  /** Which dimension was carried over from the previous turn. */
  fromMemory: { color: boolean; size: boolean }
}

export function variantQuery(p: CatalogProduct, u: Understood, focus: Focus | null | undefined): VariantQuery {
  const match = matchColors(u.norm, p.colors)
  let colors = match.colors
  const unknownColors = colors.length === 0 ? match.asked : []
  let sizes = u.sizes.filter((s) => p.sizes.includes(s))
  const unknownSizes = u.sizes.filter((s) => !p.sizes.includes(s))
  if (sizes.length === 0 && unknownSizes.length === 0) {
    // "30 байгаа юу?" on jeans: a bare number that is one of this product's sizes.
    const numeric = u.numbers.filter((n) => p.sizes.includes(n))
    if (numeric.length === 1) sizes = numeric
  }
  const memory = focus && focus.productId === p.id ? focus : null
  const fromMemory = { color: false, size: false }
  // "Хар байгаа юу?" then "L размер?": the colour from the previous turn still applies (and vice versa).
  if (memory && colors.length === 0 && match.asked.length === 0 && memory.colorId && (sizes.length > 0 || u.topics.includes('stock'))) {
    const c = p.colors.find((x) => x.id === memory.colorId)
    if (c && sizes.length > 0) {
      colors = [c]
      fromMemory.color = true
    }
  }
  if (memory && sizes.length === 0 && unknownSizes.length === 0 && memory.size && colors.length > 0 && !fromMemory.color && p.sizes.includes(memory.size)) {
    sizes = [memory.size]
    fromMemory.size = true
  }
  if (p.sizes.length === 1 && sizes.length === 0) sizes = [p.sizes[0]]
  return { colors, unknownColors, sizes, unknownSizes, fromMemory }
}

function focusFor(p: CatalogProduct, q: VariantQuery, now: number, previous?: Focus | null): Focus {
  const keep = previous && previous.productId === p.id ? previous : null
  return {
    productId: p.id,
    colorId: q.colors.length === 1 ? q.colors[0].id : (keep?.colorId ?? (p.colors.length === 1 ? p.colors[0].id : null)),
    size: q.sizes.length === 1 ? q.sizes[0] : (keep?.size ?? null),
    at: now,
  }
}

// ---------------------------------------------------------------------------
// Product answers
// ---------------------------------------------------------------------------

/** Exact colour × size availability, with alternatives when the asked variant is sold out. */
export function stockAnswer(tc: ToolContext, p: CatalogProduct, u: Understood, focus: Focus | null | undefined, now: number): Answer {
  const q = variantQuery(p, u, focus)
  const lines: string[] = []
  const actions: ChatAction[] = []
  const events = ['variant_check']
  const colorList = p.colors.map((c) => c.name).join(', ')

  if (q.unknownSizes.length) {
    events.push('variant_unavailable')
    lines.push(`${quote(p)} ${q.unknownSizes.map(sizeLabel).join(', ')} хэмжээгүй. Энэ барааны хэмжээ: ${p.sizes.map(sizeLabel).join(', ')}.`)
  }
  if (q.unknownColors.length) {
    events.push('variant_unavailable')
    const asked = q.unknownColors.map((c) => c.phrase).join(', ')
    lines.push(`${quote(p)} ${asked} өнгөөр байхгүй. Байгаа өнгө: ${colorList}.`)
    const size = q.sizes.length === 1 ? q.sizes[0] : null
    for (const c of p.colors) {
      if (size) {
        const v = variantsOf(p, c.id, size)[0]
        if (v) lines.push(`- ${c.name} / ${sizeLabel(size)}: ${stockPhrase(tc, v)}`)
      } else {
        const inStock = sizesInStock(tc, p, c.id)
        lines.push(`- ${c.name}: ${inStock || 'одоогоор бүх хэмжээ дууссан'}`)
      }
    }
  } else if (q.colors.length > 0 && q.sizes.length > 0) {
    const pairs = q.colors.flatMap((c) => q.sizes.map((s) => ({ c, s, v: variantsOf(p, c.id, s)[0] })))
    if (pairs.length === 1) {
      const { c, s, v } = pairs[0]
      const memoryNote = q.fromMemory.color ? ' (өмнө асуусан өнгөөр)' : q.fromMemory.size ? ' (өмнө асуусан хэмжээгээр)' : ''
      if (v && sellable(v)) {
        lines.push(`Тийм, ${quote(p)} — ${c.name} / ${sizeLabel(s)}${memoryNote}: ${stockPhrase(tc, v)}. Үнэ ${money(v.price)}.`)
        actions.push(addToCartAction(p, v))
      } else {
        events.push('variant_unavailable')
        lines.push(`Уучлаарай, ${quote(p)} — ${c.name} / ${sizeLabel(s)}${memoryNote} ${v ? stockPhrase(tc, v) : 'гэсэн хувилбар байхгүй'}.`)
        const sameColor = variantsOf(p, c.id).filter((x) => sellable(x) && x.size !== s)
        const sameSize = variantsOf(p, null, s).filter((x) => sellable(x) && x.colorId !== c.id)
        if (sameColor.length) lines.push(`${c.name} өнгөөр байгаа хэмжээ: ${sameColor.map((x) => `${sizeLabel(x.size)} (${shortStock(tc, x)})`).join(', ')}.`)
        if (sameSize.length) lines.push(`${sizeLabel(s)} хэмжээ бусад өнгөөр: ${sameSize.map((x) => `${colorOf(p, x)?.name} (${shortStock(tc, x)})`).join(', ')}.`)
        if (!sameColor.length && !sameSize.length) {
          const any = p.variants.filter(sellable)
          lines.push(any.length ? `Бусад бэлэн хувилбар: ${any.slice(0, 6).map((x) => `${colorOf(p, x)?.name} / ${sizeLabel(x.size)}`).join(', ')}.` : 'Энэ барааны бүх хувилбар одоогоор дууссан байна.')
        }
      }
    } else {
      lines.push(`${quote(p)}:`)
      for (const { c, s, v } of pairs) lines.push(`- ${c.name} / ${sizeLabel(s)}: ${v ? stockPhrase(tc, v) : 'хувилбар байхгүй'}`)
      const firstSellable = pairs.find((x) => x.v && sellable(x.v))
      if (firstSellable?.v) actions.push(addToCartAction(p, firstSellable.v))
    }
  } else if (q.colors.length > 0) {
    lines.push(`${quote(p)}:`)
    for (const c of q.colors) {
      const inStock = sizesInStock(tc, p, c.id)
      const out = soldOutSizes(p, c.id)
      lines.push(`- ${c.name}: ${inStock ? `${inStock} байна` : 'одоогоор бүх хэмжээ дууссан'}${inStock && out.length ? `; ${out.join(', ')} дууссан` : ''}`)
      if (!inStock) events.push('variant_unavailable')
    }
    if (q.colors.length === 1 && p.sizes.length > 1) lines.push('Ямар хэмжээ авах вэ? Хэмжээгээ бичвэл яг тэр хувилбарыг шалгая.')
  } else if (q.sizes.length > 0) {
    const s = q.sizes[0]
    const rows = variantsOf(p, null, s)
    lines.push(`${quote(p)} — ${sizeLabel(s)} хэмжээ:`)
    for (const v of rows.sort((a, b) => p.colors.findIndex((c) => c.id === a.colorId) - p.colors.findIndex((c) => c.id === b.colorId))) {
      lines.push(`- ${colorOf(p, v)?.name}: ${stockPhrase(tc, v)}`)
    }
    if (!rows.some(sellable)) {
      events.push('variant_unavailable')
      const near = p.variants.filter(sellable)
      if (near.length) lines.push(`Бусад бэлэн хэмжээ: ${[...new Set(near.map((x) => sizeLabel(x.size)))].join(', ')}.`)
    } else if (p.colors.length > 1) lines.push('Аль өнгийг авах вэ?')
    if (rows.length === 1 && sellable(rows[0])) actions.push(addToCartAction(p, rows[0]))
  } else {
    lines.push(`${quote(p)} — ${AVAILABILITY_LABELS[availabilityOf(p)].toLowerCase()}:`)
    for (const c of p.colors) {
      const inStock = sizesInStock(tc, p, c.id)
      lines.push(`- ${c.name}: ${inStock || 'дууссан'}`)
    }
  }
  lines.push(`Дэлгэрэнгүй: ${link(p)}`)
  return {
    text: lines.join('\n'),
    productIds: [p.id],
    actions: [...actions, pageAction(p)],
    suggestions: q.sizes.length === 0 ? ['Хэмжээний хүснэгт', 'Хүргэлт хэд хоног вэ?'] : ['Авъя', 'Хүргэлт хэд хоног вэ?'],
    events,
    focus: focusFor(p, q, now, focus),
  }
}

/** Price, with per-size prices when larger sizes cost more. */
export function priceAnswer(tc: ToolContext, p: CatalogProduct, u: Understood, focus: Focus | null | undefined, now: number): Answer {
  const q = variantQuery(p, u, focus)
  const active = p.variants.filter((v) => v.isActive)
  let text: string
  if (q.sizes.length === 1 && active.some((v) => v.size === q.sizes[0])) {
    const v = active.find((x) => x.size === q.sizes[0] && (q.colors.length !== 1 || x.colorId === q.colors[0].id)) ?? active.find((x) => x.size === q.sizes[0])!
    text = `${quote(p)} — ${sizeLabel(v.size)} хэмжээ: **${money(v.price)}**.`
  } else if (p.minPrice === p.maxPrice) {
    text = `${quote(p)} — **${money(p.minPrice)}**.`
  } else {
    const byPrice = new Map<number, string[]>()
    for (const v of active) {
      const list = byPrice.get(v.price) ?? []
      if (!list.includes(v.size)) list.push(v.size)
      byPrice.set(v.price, list)
    }
    const groups = [...byPrice.entries()].sort((a, b) => a[0] - b[0]).map(([price, sizes]) => `${sizes.sort(compareSizes).map(sizeLabel).join(', ')}: ${money(price)}`)
    text = `${quote(p)} — ${priceRange(p)}.\n${groups.map((g) => `- ${g}`).join('\n')}`
  }
  const colors = p.colors.map((c) => c.name).join(', ')
  text += `\nӨнгө: ${colors}. ${link(p)}`
  return { text, productIds: [p.id], actions: [pageAction(p)], suggestions: ['L размер байгаа юу?', 'Ямар өнгөтэй вэ?'], events: ['product_answer'], focus: focusFor(p, q, now, focus) }
}

/** All colours with the sizes in stock — or the other colours than the one chosen. */
export function colorsAnswer(tc: ToolContext, p: CatalogProduct, u: Understood, focus: Focus | null | undefined, now: number, other = false): Answer {
  const current = focus?.productId === p.id ? focus.colorId : null
  const q = variantQuery(p, u, focus)
  const exclude = other ? (q.colors.length ? q.colors.map((c) => c.id) : current ? [current] : []) : []
  const shown = p.colors.filter((c) => !exclude.includes(c.id))
  let text: string
  if (shown.length === 0) {
    text = `${quote(p)} зөвхөн ${p.colors.map((c) => c.name).join(', ')} өнгөтэй. Өөр өнгө одоогоор байхгүй.`
  } else {
    const head = other
      ? exclude.length
        ? `${quote(p)} өөр өнгө:`
        : `${quote(p)} ${p.colors.length} өнгөтэй:`
      : `${quote(p)} ${p.colors.length === 1 ? 'нэг өнгөтэй' : `${p.colors.length} өнгөтэй`}:`
    const rows = shown.map((c) => `- ${c.name}: ${sizesInStock(tc, p, c.id) || 'одоогоор дууссан'}`)
    text = [p.colors.length === 1 && other ? `${quote(p)} зөвхөн ${p.colors[0].name} өнгөтэй.` : head, ...(p.colors.length === 1 && other ? [] : rows)].join('\n')
    if (p.colors.length === 1 && other) text += `\n- ${p.colors[0].name}: ${sizesInStock(tc, p, p.colors[0].id) || 'одоогоор дууссан'}`
  }
  text += `\n${link(p)}`
  return { text, productIds: [p.id], actions: [pageAction(p)], suggestions: ['L размер байгаа юу?', 'Үнэ хэд вэ?'], events: ['product_answer'], focus: focusFor(p, q, now, focus) }
}

/** The sizes this product comes in, and which are in stock (for the chosen colour when there is one). */
export function sizesAnswer(tc: ToolContext, p: CatalogProduct, u: Understood, focus: Focus | null | undefined, now: number): Answer {
  const q = variantQuery(p, u, focus)
  const color = q.colors.length === 1 ? q.colors[0] : focus?.productId === p.id && focus.colorId ? p.colors.find((c) => c.id === focus.colorId) : undefined
  const lines = [`${quote(p)} хэмжээ: ${p.sizes.map(sizeLabel).join(', ')}.`]
  for (const c of color ? [color] : p.colors) {
    lines.push(`- ${c.name}: ${sizesInStock(tc, p, c.id) || 'одоогоор дууссан'}`)
  }
  lines.push(`Хэмжээгээ сонгоход [хэмжээний хүснэгт](/size-guide) туслана. ${link(p)}`)
  return { text: lines.join('\n'), productIds: [p.id], actions: [pageAction(p)], suggestions: ['Аль размер авах вэ?', 'Хүргэлт хэд хоног вэ?'], events: ['product_answer'], focus: focusFor(p, q, now, focus) }
}

/** Material, care and fit exactly as published on the product. */
export function factsAnswer(tc: ToolContext, p: CatalogProduct, u: Understood, focus: Focus | null | undefined, now: number): Answer {
  const detail = tc.details.get(p.id)
  const lines: string[] = []
  const wants = (t: string) => u.topics.includes(t as never)
  const missing: string[] = []
  if (wants('material') || (!wants('care') && !wants('fit'))) lines.push(`**Материал:** ${p.material}`)
  if (wants('care')) {
    if (detail?.care) lines.push(`**Арчилгаа:** ${detail.care}`)
    else missing.push('арчилгааны заавар')
  }
  if (wants('fit')) {
    if (p.fit) lines.push(`**Хэлбэр:** ${p.fit}`)
    else missing.push('хэлбэрийн мэдээлэл')
  }
  if (wants('description')) {
    if (detail?.description) lines.push(detail.description)
  }
  if (missing.length) lines.push(`${missing.join(', ')} энэ бараанд оруулаагүй байна — таамаглаж хэлэхгүй. Ажилтнаас лавлаж болно.`)
  const q = variantQuery(p, u, focus)
  return {
    text: `${quote(p)}\n${lines.join('\n')}\n${link(p)}`,
    productIds: [p.id],
    actions: [pageAction(p)],
    suggestions: ['Аль размер авах вэ?', 'Ямар өнгөтэй вэ?'],
    events: missing.length ? ['product_answer', 'unanswered'] : ['product_answer'],
    focus: focusFor(p, q, now, focus),
  }
}

const BOTTOM_CATEGORIES = new Set(['trousers', 'jeans'])

/**
 * Which size to take: the owner's size chart and the product's published fit —
 * never a size picked from height and weight, which the store has no rule for.
 */
export function sizeAdviceAnswer(tc: ToolContext, p: CatalogProduct | null): Answer {
  const guide = p && BOTTOM_CATEGORIES.has(p.categorySlug) ? tc.sizeGuide.bottoms : tc.sizeGuide.tops
  const oneSize = p && p.sizes.length === 1
  const lines: string[] = []
  if (oneSize) {
    lines.push(`${quote(p!)} нэг хэмжээтэй (${sizeLabel(p!.sizes[0])}).`)
  } else {
    if (p) lines.push(`${quote(p)}${p.fit ? ` — хэлбэр: ${p.fit}.` : '.'}`)
    lines.push('Өндөр, жингээр хэмжээ сонгох баталгаатай дүрэм манайд байхгүй тул таамаглаж хэлэхгүй. Биеийн хэмжээгээ хүснэгттэй харьцуулаарай:')
    lines.push(`${['Хэмжээ', ...guide.columns].join(' · ')}`)
    for (const row of guide.rows) lines.push(`- ${row.size}: ${guide.columns.map((c) => row[c]).join(' · ')}`)
    if (tc.sizeGuide.note) lines.push(tc.sizeGuide.note)
    lines.push('Бүтэн хүснэгт: [хэмжээний хүснэгт](/size-guide). Эргэлзвэл «ажилтантай холбогдох» гэж бичээрэй — ажилтан тусална.')
  }
  return {
    text: lines.join('\n'),
    productIds: p ? [p.id] : [],
    actions: [{ type: 'link', href: '/size-guide', label: 'Хэмжээний хүснэгт' }],
    suggestions: oneSize ? ['Үнэ хэд вэ?'] : ['Ажилтантай холбогдох', 'Хэмжээ солих нөхцөл'],
    events: ['size_guide'],
  }
}

export function imagesAnswer(p: CatalogProduct): Answer {
  return {
    text: `${quote(p)}-ийн зургийг барааны хуудаснаас өнгө тус бүрээр харна: ${link(p)}`,
    productIds: [p.id],
    actions: [pageAction(p)],
    suggestions: ['Ямар өнгөтэй вэ?'],
    events: ['product_answer'],
  }
}

/** Side-by-side facts; no general fabric knowledge is added. */
export function compareAnswer(tc: ToolContext, products: CatalogProduct[]): Answer {
  const rows = products.slice(0, 4).map((p) => {
    const sizes = [...new Set(p.variants.filter(sellable).map((v) => sizeLabel(v.size)))].sort(compareSizes)
    return `**${p.name}** — ${priceRange(p)}\n- Материал: ${p.material}\n- Хэлбэр: ${p.fit ?? 'оруулаагүй'}\n- Өнгө: ${p.colors.map((c) => c.name).join(', ')}\n- Бэлэн хэмжээ: ${sizes.join(', ') || 'үлдэгдэлгүй'}`
  })
  return {
    text: `Дэлгүүрийн мэдээллээр харьцуулбал:\n\n${rows.join('\n\n')}`,
    productIds: products.slice(0, 4).map((p) => p.id),
    actions: [],
    suggestions: ['Аль размер авах вэ?', 'Хүргэлт хэд хоног вэ?'],
    events: ['comparison'],
    candidates: products.slice(0, 4).map((p) => p.id),
  }
}

/** A numbered list the next message can pick from ("2", "хоёрдугаар"). */
export function listAnswer(tc: ToolContext, products: CatalogProduct[], heading: string, more?: { total: number; href: string }): Answer {
  const shown = products.slice(0, 6)
  const lines = shown.map((p, i) => {
    const colors = p.colors.map((c) => c.name).join(', ')
    return `${i + 1}) ${link(p)} — ${priceRange(p)} · ${colors} · ${AVAILABILITY_LABELS[availabilityOf(p)].toLowerCase()}`
  })
  const total = more?.total ?? products.length
  const tail = total > shown.length ? `\n…нийт ${total}. Бүгдийг [дэлгүүрээс](${more?.href ?? '/shop'}) үзээрэй.` : ''
  return {
    text: `${heading}\n${lines.join('\n')}${tail}\nДугаараар нь сонгоод асуугаарай (жишээ: «2 L размер байгаа юу?»).`,
    productIds: shown.map((p) => p.id),
    actions: [],
    suggestions: shown[0] ? [`${shown[0].name} үнэ хэд вэ?`, 'Эдгээрийн ялгаа юу вэ?'] : [],
    events: ['search'],
    candidates: shown.map((p) => p.id),
  }
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

function paragraphs(text: string): string[] {
  return text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
}

const policyLink = (key: keyof typeof POLICY_SLUGS, title: string) => `[${title}](/help/${POLICY_SLUGS[key]})`

function shippingLines(tc: ToolContext, withEta: boolean): string[] {
  return tc.shipping.map((m) => {
    const fee = m.fee === 0 ? 'үнэгүй' : money(m.fee)
    const free = m.freeThreshold ? ` (${money(m.freeThreshold)}-өөс дээш захиалгад үнэгүй)` : ''
    return withEta ? `- **${m.name}** — ${m.eta}; ${fee}${free}` : `- **${m.name}** — ${fee}${free}, ${m.eta}`
  })
}

export function policyAnswer(tc: ToolContext, topic: PolicyTopic): Answer {
  const base = { productIds: [] as string[], actions: [] as ChatAction[], events: [`policy:${topic}`] }
  const demo = (key: 'delivery' | 'payment' | 'returns') => paragraphs(tc.policies[key].body).find((p) => p.startsWith('Демо')) ?? ''
  switch (topic) {
    case 'delivery_time':
      return {
        ...base,
        text: ['Хүргэлтийн хугацаа:', ...shippingLines(tc, true), 'Захиалга баталгаажмагц хүргэлтийн цагийг тохирно.', demo('delivery'), `Дэлгэрэнгүй: ${policyLink('delivery', tc.policies.delivery.title)}`].filter(Boolean).join('\n'),
        suggestions: ['Хүргэлтийн үнэ хэд вэ?', 'Яаж захиалах вэ?'],
      }
    case 'delivery': {
      const rest = paragraphs(tc.policies.delivery.body).filter((p) => !/^(Улаанбаатар хот|Шуурхай|Орон нутаг)/.test(p))
      return {
        ...base,
        text: [`**${tc.policies.delivery.title}**`, ...shippingLines(tc, false), '', ...rest, `Дэлгэрэнгүй: ${policyLink('delivery', tc.policies.delivery.title)}`].join('\n'),
        suggestions: ['Буцаах нөхцөл ямар вэ?', 'Яаж захиалах вэ?'],
      }
    }
    case 'returns':
    case 'exchange':
    case 'payment':
    case 'privacy': {
      const policy = tc.policies[topic]
      return {
        ...base,
        text: [`**${policy.title}**`, ...paragraphs(policy.body).slice(0, 5), `Дэлгэрэнгүй: ${policyLink(topic, policy.title)}`].join('\n\n'),
        suggestions: topic === 'exchange' ? ['L размер байгаа юу?', 'Буцаах нөхцөл ямар вэ?'] : ['Хүргэлт хэд хоног вэ?', 'Яаж захиалах вэ?'],
      }
    }
    case 'ordering': {
      const steps = paragraphs(tc.policies.ordering.body).filter((p) => /^\d\./.test(p))
      return {
        ...base,
        text: [
          '**Хоёр аргаар захиална:**',
          '**1. Сайтаар:**',
          ...steps,
          '**2. Энд чатаар:** барааныхаа нэр, өнгө, хэмжээг бичээд «авъя» гэж бичээрэй. Би үлдэгдлийг шалгаж, үнийг тооцоолоод, баталгаажуулсны дараа захиалгыг үүсгэнэ.',
          demo('payment'),
        ]
          .filter(Boolean)
          .join('\n'),
        suggestions: ['Хар hoodie L авъя', 'Хүргэлт хэд хоног вэ?'],
      }
    }
    case 'tracking':
      return {
        ...base,
        text: [
          'Захиалгынхаа явцыг шалгах:',
          '- [Миний захиалга](/orders) хуудсанд энэ хөтчөөр хийсэн захиалгууд төлөвтэйгөө харагдана.',
          '- Захиалгын хуудсанд явц нь алхам алхмаар харагдана: хүлээгдэж буй → баталгаажсан → бэлтгэж буй → хүргэлтэд гарсан → хүргэгдсэн.',
          '- Эсвэл энд захиалгын дугаар (MN-…) болон захиалгад өгсөн утасны дугаараа бичвэл төлөвийг хэлье.',
        ].join('\n'),
        actions: [{ type: 'link', href: '/orders', label: 'Миний захиалга' }],
        suggestions: [],
      }
    case 'change_order': {
      const change = paragraphs(tc.policies.ordering.body).find((p) => p.startsWith('Захиалгаа өөрчлөх'))
      return {
        ...base,
        text: [change ?? `${policyLink('ordering', tc.policies.ordering.title)}-оос үзнэ үү.`, 'Өөрчлөлтийг ажилтан хийнэ: «ажилтантай холбогдох» гэж бичвэл энэ яриаг ажилтанд шилжүүлнэ.'].join('\n\n'),
        suggestions: ['Ажилтантай холбогдох'],
      }
    }
    case 'size_guide':
      return { ...sizeAdviceAnswer(tc, null), events: ['size_guide'] }
    case 'contact':
      return {
        ...base,
        text: `Энэ бол портфолио демо дэлгүүр тул бодит утас, хаяг, дэлгүүр байхгүй. Жишээ холбоо барих хаяг: **${tc.info.contactEmail}** (${tc.info.contactHours}). Хүн хэрэгтэй бол «ажилтантай холбогдох» гэж бичээрэй — яриаг ажилтанд шилжүүлнэ.`,
        suggestions: ['Ажилтантай холбогдох', 'Хүргэлт хэд хоног вэ?'],
      }
    case 'about':
      return {
        ...base,
        text: `${tc.info.storeName} бол Ursgal Digital-ын портфолиод зориулсан зохиомол хувцасны брэнд — бүртгэлтэй компани биш. Бараа, үнэ, үлдэгдэл нь жишээ өгөгдөл боловч дэлгүүрийн сан, захиалга, үлдэгдлийн систем бодитоор ажилладаг. Төлбөр симуляц, мөнгө шилжихгүй.`,
        suggestions: ['Ямар бараа байна?', 'Яаж захиалах вэ?'],
      }
  }
}
