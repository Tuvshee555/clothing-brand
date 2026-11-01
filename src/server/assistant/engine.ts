// Catalogue mode: answers composed only from database tool results. Used when
// no AI key is configured, when the daily AI budget is spent, and as the safe
// fallback whenever an AI reply fails its fact check.
import { parseQuestion, type ParsedQuestion } from '@/lib/assistant-parse'
import { sizeLabel, TAG_LABELS } from '@/lib/catalog'
import { COLOR_FAMILIES, filterCatalog, type CatalogProduct } from '@/lib/catalog-filter'
import { formatMoney } from '@/lib/money'
import { POLICY_SLUGS, type PolicyKey } from '@/lib/settings'
import { cardsFor, checkStock, getPolicy, productFacts, type ProductFacts, type ToolContext } from './tools'

export interface AssistantReply {
  reply: string
  products: ProductFacts[]
  suggestions: string[]
  mode: 'ai' | 'catalog'
}

export const STARTER_SUGGESTIONS = ['Ямар hoodie байна?', 'Хар hoodie L размер байгаа юу?', '200,000₮-өөс доош юу байна?', 'Хүргэлтийн нөхцөл ямар вэ?']

function price(p: CatalogProduct): string {
  return p.minPrice === p.maxPrice ? formatMoney(p.minPrice) : `${formatMoney(p.minPrice)}–${formatMoney(p.maxPrice)}`
}

function line(p: CatalogProduct): string {
  const facts = productFacts(p)
  const colors = p.colors.map((c) => c.name).join(', ')
  return `- [${p.name}](/products/${p.slug}) — ${price(p)} · ${colors} · ${facts.availability.toLowerCase()}`
}

function policyAnswer(tc: ToolContext, topic: ParsedQuestion['policy']): AssistantReply | null {
  if (!topic) return null
  if (topic === 'contact') {
    return {
      reply: `Энэ бол портфолио демо дэлгүүр тул бодит утас, хаяг байхгүй. Жишээ холбоо барих хаяг: **${tc.info.contactEmail}** (${tc.info.contactHours}). Бараа, хэмжээ, хүргэлтийн талаар надаас асууж болно.`,
      products: [],
      suggestions: ['Хүргэлтийн нөхцөл ямар вэ?', 'Хэрхэн захиалах вэ?'],
      mode: 'catalog',
    }
  }
  const data = getPolicy(tc, topic)
  if (!('text' in data) || !data.text) return null
  const key = data.topic as PolicyKey
  const paragraphs = data.text.split(/\n\n+/)
  let body: string
  if (topic === 'change_order') {
    body = paragraphs.find((p) => p.startsWith('Захиалгаа өөрчлөх')) ?? paragraphs.slice(-1)[0]
  } else if (key === 'delivery' && 'shippingMethods' in data && data.shippingMethods) {
    const methods = data.shippingMethods
      .map((m) => `- **${m.name}** — ${m.fee === 0 ? 'үнэгүй' : formatMoney(m.fee)}${m.freeFrom ? ` (${formatMoney(m.freeFrom)}-өөс дээш захиалгад үнэгүй)` : ''}, ${m.eta}`)
      .join('\n')
    body = `${methods}\n\n${paragraphs.filter((p) => !p.startsWith('Улаанбаатар хот') && !p.startsWith('Шуурхай') && !p.startsWith('Орон нутаг')).join('\n\n')}`
  } else {
    body = paragraphs.slice(0, 5).join('\n\n')
  }
  return {
    reply: `**${data.title}**\n\n${body}\n\nДэлгэрэнгүй: [${data.title}](/help/${POLICY_SLUGS[key]})`,
    products: [],
    suggestions: topic === 'delivery' ? ['Буцаах нөхцөл ямар вэ?', 'Хэрхэн захиалах вэ?'] : ['Хүргэлтийн нөхцөл ямар вэ?', 'Ямар hoodie байна?'],
    mode: 'catalog',
  }
}

function stockAnswer(tc: ToolContext, product: CatalogProduct, q: ParsedQuestion): AssistantReply {
  const colorWord = q.colors[0] ? COLOR_FAMILIES[q.colors[0]].label : null
  const sizes = q.sizes.length ? q.sizes : [null]
  const rows: string[] = []
  let any = false
  for (const size of sizes) {
    const result = checkStock(tc, { product: product.slug, color: colorWord, size })
    if (!('variants' in result) || !result.variants) continue
    for (const v of result.variants) {
      if (v.stock > 0) any = true
      rows.push(`- ${v.color}, ${v.size}: ${v.stock > 0 ? `**${v.stock} ширхэг байна**` : 'дууссан'}`)
    }
  }
  const wanted = [colorWord?.toLowerCase(), q.sizes.map(sizeLabel).join('/')].filter(Boolean).join(' ')
  if (rows.length === 0) {
    const offered = product.sizes.map(sizeLabel).join(', ')
    return {
      reply: `«${product.name}» ${wanted ? `${wanted} хувилбараар` : ''} байхгүй байна. Энэ бараа ${product.colors.map((c) => c.name).join(', ')} өнгөөр, ${offered} хэмжээтэй.`,
      products: cardsFor(tc, [product.slug]),
      suggestions: [`${product.name} ямар өнгөтэй вэ?`, 'Хэмжээ солих нөхцөл?'],
      mode: 'catalog',
    }
  }
  const head = any
    ? `Тийм, «${product.name}»${wanted ? ` (${wanted})` : ''} байна. Сангийн одоогийн үлдэгдэл:`
    : `Уучлаарай, «${product.name}»${wanted ? ` (${wanted})` : ''} одоогоор дууссан байна:`
  const tail = any
    ? `\n\nАвах бол [бүтээгдэхүүний хуудас](/products/${product.slug}) руу орж өнгө, хэмжээгээ сонгоод сагсанд нэмнэ үү.`
    : `\n\nӨөр өнгө, хэмжээг [бүтээгдэхүүний хуудаснаас](/products/${product.slug}) шалгаарай.`
  return { reply: `${head}\n${rows.slice(0, 12).join('\n')}${tail}`, products: cardsFor(tc, [product.slug]), suggestions: ['Хүргэлтийн нөхцөл ямар вэ?', 'Хэмжээ солих нөхцөл?'], mode: 'catalog' }
}

function compareAnswer(tc: ToolContext, products: CatalogProduct[]): AssistantReply {
  const rows = products.slice(0, 4).map((p) => {
    const inStock = p.variants.filter((v) => v.isActive && v.stock > 0)
    const sizes = [...new Set(inStock.map((v) => sizeLabel(v.size)))].join(', ') || 'үлдэгдэлгүй'
    return `**${p.name}** — ${price(p)}\n- Материал: ${p.material}\n- Хэлбэр: ${p.fit ?? '—'}\n- Өнгө: ${p.colors.map((c) => c.name).join(', ')}\n- Одоо байгаа хэмжээ: ${sizes}`
  })
  return {
    reply: `Ялгааг сангийн мэдээллээр харьцуулбал:\n\n${rows.join('\n\n')}`,
    products: cardsFor(tc, products.map((p) => p.slug)),
    suggestions: ['Хэмжээний хүснэгт хаана байна?', 'Хүргэлтийн нөхцөл ямар вэ?'],
    mode: 'catalog',
  }
}

export function answerFromCatalog(tc: ToolContext, message: string, context: { slugs: string[]; pageSlug?: string | null }): AssistantReply {
  const q = parseQuestion(message)
  const contextProducts = [context.pageSlug, ...context.slugs]
    .filter((s): s is string => !!s)
    .map((s) => tc.catalog.find((p) => p.slug === s))
    .filter((p): p is CatalogProduct => !!p)

  if (q.greeting && q.productQuery.split(' ').length <= 3 && !q.policy) {
    return {
      reply: `Сайн байна уу! Би ${tc.info.storeName}-ы худалдааны туслах. Бараа, өнгө, хэмжээ, үлдэгдэл, үнэ, хүргэлт, буцаалтын талаар асуугаарай — хариултыг дэлгүүрийн сангаас шууд уншина.`,
      products: [],
      suggestions: STARTER_SUGGESTIONS,
      mode: 'catalog',
    }
  }

  const policy = policyAnswer(tc, q.policy)
  if (policy && !q.productQuery.match(/hoodie|цамц|хүрэм|өмд|жинс|пальто|свитер/)) return policy

  // Product matching from the remaining words (or the winter tag).
  const query = q.productQuery
  let matched = query ? filterCatalog(tc.catalog, { q: query, colors: q.colors, sizes: q.sizes, maxPrice: q.maxPrice, minPrice: q.minPrice }, TAG_LABELS) : []
  if (query && matched.length === 0 && (q.colors.length || q.sizes.length)) {
    // Maybe the colour/size combination is what's missing — check without it to explain honestly.
    const loose = filterCatalog(tc.catalog, { q: query }, TAG_LABELS)
    if (loose.length === 1) return stockAnswer(tc, loose[0], q)
    if (loose.length > 1) {
      const wanted = [q.colors.map((c) => COLOR_FAMILIES[c].label.toLowerCase()).join('/'), q.sizes.join('/')].filter(Boolean).join(' ')
      return {
        reply: `${wanted ? `${wanted} хувилбараар ` : ''}тохирох бараа одоогоор алга. Ижил төрлийн бусад бараа:\n${loose.slice(0, 5).map(line).join('\n')}`,
        products: cardsFor(tc, loose.map((p) => p.slug)),
        suggestions: ['Хэмжээ солих нөхцөл?'],
        mode: 'catalog',
      }
    }
  }
  if (!query || matched.length === 0) {
    if (q.winter) matched = filterCatalog(tc.catalog, { colors: q.colors, sizes: q.sizes, maxPrice: q.maxPrice }).filter((p) => p.tags.includes('winter'))
    else if (q.maxPrice || q.minPrice || q.colors.length || ((q.cheapest || q.priciest) && !query)) {
      matched = filterCatalog(tc.catalog, { colors: q.colors, sizes: q.sizes, maxPrice: q.maxPrice, minPrice: q.minPrice })
    }
  }

  if (q.compare) {
    const pool = matched.length >= 2 ? matched : contextProducts
    if (pool.length >= 2) return compareAnswer(tc, pool)
  }

  // "Is size L available?" about the product being viewed / just discussed.
  if (q.stockQuestion && matched.length === 0 && contextProducts.length > 0 && (q.sizes.length || q.colors.length)) {
    return stockAnswer(tc, contextProducts[0], q)
  }
  if (q.stockQuestion && matched.length === 1 && (q.sizes.length || q.colors.length)) return stockAnswer(tc, matched[0], q)

  if (matched.length > 0) {
    if (q.cheapest || q.priciest) {
      const sorted = [...matched].sort((a, b) => (q.cheapest ? a.minPrice - b.minPrice : b.minPrice - a.minPrice))
      const top = sorted[0]
      const others = sorted.slice(1, 3)
      return {
        reply: `${q.cheapest ? 'Хамгийн хямд нь' : 'Хамгийн үнэтэй нь'} [${top.name}](/products/${top.slug}) — **${price(top)}**.${others.length ? `\n\nДараагийнх нь:\n${others.map(line).join('\n')}` : ''}`,
        products: cardsFor(tc, sorted.slice(0, 3).map((p) => p.slug)),
        suggestions: [`${top.name} L размер байгаа юу?`, 'Хүргэлтийн нөхцөл ямар вэ?'],
        mode: 'catalog',
      }
    }
    const intro = q.winter
      ? 'Өвлийн хүйтэнд тохирох (дулаан, давхарлаж өмсөх) бараанууд:'
      : q.maxPrice
        ? `${formatMoney(q.maxPrice)}-өөс доош үнэтэй бараанууд:`
        : q.minPrice
          ? `${formatMoney(q.minPrice)}-өөс дээш үнэтэй бараанууд:`
          : `Танд тохирох ${matched.length} бараа олдлоо:`
    const shown = matched.slice(0, 6)
    return {
      reply: `${intro}\n${shown.map(line).join('\n')}${matched.length > shown.length ? `\n\n…болон өөр ${matched.length - shown.length}. Бүгдийг [дэлгүүрээс](/shop${query ? `?q=${encodeURIComponent(query)}` : ''}) үзээрэй.` : ''}`,
      products: cardsFor(tc, shown.map((p) => p.slug)),
      suggestions: shown[0] ? [`${shown[0].name} L размер байгаа юу?`, 'Эдгээрийн ялгаа юу вэ?', 'Хүргэлтийн нөхцөл ямар вэ?'] : STARTER_SUGGESTIONS,
      mode: 'catalog',
    }
  }

  if (policy) return policy

  if (query) {
    return {
      reply: `Уучлаарай, «${message.slice(0, 60)}» гэсэн асуултад тохирох бараа манай сангаас олдсонгүй. Манайд: ${tc.categories.map((c) => c.name.toLowerCase()).join(', ')} байна. Өөрөөр тодорхойлж асуух уу?`,
      products: [],
      suggestions: STARTER_SUGGESTIONS,
      mode: 'catalog',
    }
  }
  return {
    reply: `Би ${tc.info.storeName} дэлгүүрийн бараа, өнгө, хэмжээ, үлдэгдэл, үнэ, хүргэлт, буцаалтын талаар хариулдаг. Энэ асуултад баттай хариулах мэдээлэл надад алга. Жишээ нь: «хар hoodie L байгаа юу?» гэж асуугаарай.`,
    products: [],
    suggestions: STARTER_SUGGESTIONS,
    mode: 'catalog',
  }
}

export { TAG_LABELS }
