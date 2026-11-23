// Understanding one shopper message (pure). It extracts *what is asked* —
// topics, colours, sizes, quantity, price limits, policy questions, hand-over
// triggers — and *which products* the message refers to. Facts never come from
// here: answers.ts reads them from the database-loaded catalogue.
import { parsePriceLimits } from '@/lib/assistant-parse'
import { colorMentions, garmentMentions, normShopper, parseSizes, bareNumbers, type ColorMention } from '@/lib/assistant/fashion'
import { normalizeText, type CatalogProduct } from '@/lib/catalog-filter'
import {
  ADD_TO_CART,
  BUY_INTENT,
  CHAT_ORDER_HERE,
  COMPLAINT,
  HUMAN_REQUEST,
  NO,
  PAYMENT_CLAIM,
  PAYMENT_QUESTION,
  PICKUP_QUESTION,
  YES,
  isFrustrated,
  isGreeting,
  isThanksOnly,
  parseNumberedChoice,
  parsePhone,
  parseQuantity,
} from '@/lib/chat/intents'
import type { HandoffReason } from '@/lib/chat/handover'
import { isCaseSuffixedForm, isOneEditApart, phoneticLatinText, phoneticTokenMatches, scriptOf } from '@/lib/chat/text'

export type Topic =
  | 'price'
  | 'stock'
  | 'colors'
  | 'other_color'
  | 'sizes'
  | 'other_size'
  | 'material'
  | 'care'
  | 'fit'
  | 'size_advice'
  | 'description'
  | 'images'
  | 'compare'
  | 'recommend'

export type PolicyTopic =
  | 'delivery_time'
  | 'delivery'
  | 'returns'
  | 'exchange'
  | 'payment'
  | 'ordering'
  | 'tracking'
  | 'change_order'
  | 'contact'
  | 'size_guide'
  | 'privacy'
  | 'about'

export interface Understood {
  raw: string
  /** Cyrillic normal form (Latin spellings mapped, punctuation removed). */
  norm: string
  /** raw + norm, for intent patterns. */
  probe: string
  script: 'cyrillic' | 'latin' | 'other'
  greeting: boolean
  thanks: boolean
  handoff: HandoffReason | null
  buy: boolean
  addToCart: boolean
  chatHere: boolean
  yes: boolean
  no: boolean
  policy: PolicyTopic | null
  topics: Topic[]
  /** "энэ", "тэр", "this", "it": the product in focus. */
  deictic: boolean
  colors: ColorMention[]
  sizes: string[]
  /** Numbers that could be waist sizes if the product in focus has numeric sizes. */
  numbers: string[]
  quantity: number | null
  maxPrice: number | null
  minPrice: number | null
  cheapest: boolean
  priciest: boolean
  catalogQuestion: boolean
  /** "ямар цамц байна?", "хүрэм байгаа юу?": browsing a type, not asking about one product. */
  browse: boolean
  tags: string[]
  audience: 'women' | 'men' | null
  /** "хүүхдийн гутал": children's clothes or shoes, which the store does not sell. */
  kids: boolean
  garments: { word: string; categories: string[] }[]
  numbered: { index: number } | null
  orderNumber: string | null
  phone: string | null
}

const T = {
  price: /(?:үнэ|ямар\s+үнэтэй|хэдээр|хэдэн\s+төгрөг|хэд\s+(?:вэ|бэ|юм|төгрөг)|price|how\s+much|\bcost)/iu,
  notPrice: /(?:хэд(?:эн)?\s+(?:хоног|өдөр|цаг|ширхэг|өнгө|размер|хэмжээ|төрөл|удаа)|хэд\s+үлдсэн)/iu,
  stock: /(?:байгаа\s+(?:юу|уу)|байна\s+уу|бий\s+(?:юу|уу)|бэлэн|үлдсэн|үлдэгдэл|дууссан|байхгүй\s+(?:юу|юм\s+уу|уу)|авч\s+болох\s+уу|хэдэн\s+ширхэг|хэд\s+үлдсэн|in\s+stock|available|sold\s+out|\bleft\b)/iu,
  colors: /(?:ямар\s+(?:\S+\s+)?өнгө|өнгөнүүд|өнгө\S*\s+(?:ямар|байдаг|байгаа)|хэдэн\s+өнгө|what\s+colou?rs?|colou?rs?\s+(?:do|does|are))/iu,
  otherColor: /(?:өөр\s+өнгө|өөр\s+ямар\s+өнгө|other\s+colou?rs?|another\s+colou?r)/iu,
  sizes: /(?:ямар\s+(?:размер|хэмжээ)|(?:размер|хэмжээ)\S*\s+(?:ямар|байдаг|бий)|хэдэн\s+(?:размер|хэмжээ)|what\s+sizes?|sizes?\s+(?:do|does|are))/iu,
  otherSize: /(?:өөр\s+(?:размер|хэмжээ)|other\s+sizes?|another\s+size)/iu,
  material: /(?:материал|даавуу|юугаар\s+хийсэн|юунаас\s+хийсэн|найрлага|хийц|fabric|material|made\s+of)/iu,
  care: /(?:угаа|арчилгаа|индүүд|хими\s*цэвэр|хатаа|wash|\bcare\b|iron|dry\s*clean)/iu,
  fit: /(?:хэлбэр|зүсэлт|уналттай|томдо|жижигдэ|бариу|(?:том|жижиг|сул)\s+(?:юу|уу|байна\s+уу|байдаг)|\bfit\b|runs?\s+(?:small|large|big))/iu,
  sizeAdvice: /(?:аль\s+(?:размер|хэмжээ)|ямар\s+(?:размер|хэмжээ)\s+(?:авах|тохирох|өмсөх|таарах|сонгох)|(?:размер|хэмжээ)\S*\s+(?:сонго|зөвлө|тохир|таар)|\d{3}\s*см|\d{2,3}\s*кг|өндөр\s*\d|жин\s*\d|which\s+size|what\s+size\s+should)/iu,
  description: /(?:тухай|талаар|дэлгэрэнгүй|ямар\s+бараа\s+вэ|tell\s+me\s+about|details?\b)/iu,
  images: /(?:зураг|photo|picture|image)/iu,
  compare: /(?:ялгаа|харьцуул|аль\s+нь\s+(?:дээр|сайн|илүү)|difference|compare|\bvs\b)/iu,
  recommend: /(?:санал\s+болго|зөвлө|тохирох|юу\s+(?:авах|өмсөх)|бэлэг|recommend|suggest|\bgift)/iu,
  deictic: /(?:^|\s)(?:энэ|энийг|энэний|үүнийг|үүний|үүн|тэр|тэрийг|түүний|түүнийг|this|it|that)(?=\s|$)/iu,
  catalog: /(?:ямар\s+(?:бараа|бүтээгдэхүүн|хувцас|зүйл)|юу\s+(?:юу\s+)?(?:зардаг|байна|байгаа)\s*(?:вэ|бэ)?$|бүх\s+(?:бараа|бүтээгдэхүүн)|what\s+do\s+you\s+(?:sell|have)|catalog)/iu,
  cheapest: /(?:хамгийн\s+хямд|хямдхан|cheapest|lowest\s+price|хамгийн\s+бага\s+үнэ)/iu,
  priciest: /(?:хамгийн\s+үнэтэй|most\s+expensive|хамгийн\s+өндөр\s+үнэ)/iu,
}

const POLICY: [PolicyTopic, RegExp][] = [
  ['change_order', /(?:захиалг\S*\s+(?:\S+\s+)?(?:өөрч|цуца|цуцл)|cancel\s+(?:my\s+)?order|change\s+(?:my\s+)?order)/iu],
  ['tracking', /(?:захиалг\S*\s+(?:\S+\s+)?(?:явц|төлөв|шалга|хаана|хяна|байдал)|(?:явц|төлөв)\S*\s+(?:\S+\s+)?шалга|миний\s+захиалга|track|order\s+status|where\s+is\s+my\s+order)/iu],
  ['ordering', /(?:(?:яаж|хэрхэн)\s+(?:\S+\s+)?(?:захиал|худалдаж\s+ав)|захиалах\s+(?:вэ|уу)$|захиалга\s+(?:яаж|хэрхэн)|how\s+(?:do|can|to)\s+(?:i\s+)?(?:order|buy|purchase))/iu],
  ['size_guide', /(?:хэмжээний\s+хүснэгт|размерын\s+хүснэгт|хүснэгт|size\s+(?:chart|guide)|хэмжээ\s+авах\s+заавар)/iu],
  ['delivery_time', /(?:(?:хэдэн|хэд|хэр)\s+(?:хоног|өдөр|удаан|хугацаа)|хоног(?:ийн)?\s+дотор|хэзээ\s+(?:ирэх|ирнэ|хүрэх|хүрнэ|авах|авч)|(?:ирэх|хүрэх)\s+(?:вэ|уу)|how\s+(?:many\s+days|long\s+(?:does|will|is))|delivery\s+time|when\s+will\s+(?:it|my))/iu],
  ['exchange', /(?:солих|солиул|сольж|солиж|exchange)/iu],
  ['returns', /(?:буцаа(?:х|ж|лт|на|я)|return|refund)/iu],
  ['delivery', /(?:хүргэлт|хүргэх|хүргэдэг|хүргүүл|орон\s+нутаг|аймаг\S*\s+руу|явуулах|delivery|shipping|\bship\b)/iu],
  ['payment', /(?:төлбөр|төлөх|qpay|карт(?:аар)?|бэлнээр|бэлэн\s+мөнгө|payment|\bpay\b)/iu],
  ['contact', /(?:холбоо\s+барих|утас\S*\s+дугаар|и-?мэйл|хаяг\S*\s+(?:хаана|юу)|дэлгүүр\S*\s+хаана|салбар|шоурум|contact|phone\s+number|where\s+are\s+you)/iu],
  ['privacy', /(?:нууцлал|хувийн\s+мэдээлэл|privacy)/iu],
  ['about', /(?:та\s+нар\s+хэн|танай\s+(?:компани|брэнд)|бодит\s+дэлгүүр|about\s+(?:you|the\s+brand)|who\s+are\s+you)/iu],
]

const TAG_PATTERNS: [string, RegExp][] = [
  ['winter', /(?:өвөл|өвлийн|хүйтэн|дулаан|winter|warm)/iu],
  ['summer', /(?:зун(?:ы|д)?(?:\s|$)|зуны|summer)/iu],
  ['autumn', /(?:намар|намрын|autumn|\bfall\b)/iu],
  ['office', /(?:оффис|ажилд|ажлын|албан|office|\bwork\b)/iu],
  ['layering', /(?:давхарла|layer)/iu],
  ['oversized', /(?:оверсайз|чөлөөтэй|oversized)/iu],
  ['cashmere', /(?:ноолуур)/iu],
  ['wool', /(?:ноос(?!т))/iu],
  ['leather', /(?:арьс)/iu],
  ['linen', /(?:маалинга)/iu],
]

export function understand(raw: string): Understood {
  const text = raw.slice(0, 600)
  const norm = normShopper(text)
  const probe = norm === text.toLowerCase() ? text : `${text}\n${norm}`
  // "200k-aas doosh": Latin case endings after amounts.
  const priceText = norm.replace(/(\d)\s*(k|к|мянга)?\s*-?(?:aas|ees|oos|uus|as|es)(?=\s|$)/giu, '$1$2-аас')
  const { maxPrice, minPrice } = parsePriceLimits(priceText)

  let handoff: HandoffReason | null = null
  if (PAYMENT_CLAIM.test(probe) && !PAYMENT_QUESTION.test(probe)) handoff = 'payment_claim'
  else if (COMPLAINT.test(probe)) handoff = 'complaint'
  else if (HUMAN_REQUEST.test(probe) || isFrustrated(text) || isFrustrated(norm)) handoff = 'customer_request'

  const topics: Topic[] = []
  const add = (t: Topic, on: boolean) => on && !topics.includes(t) && topics.push(t)
  add('price', T.price.test(probe) && !T.notPrice.test(probe))
  add('other_color', T.otherColor.test(probe))
  add('other_size', T.otherSize.test(probe))
  add('colors', T.colors.test(probe))
  add('size_advice', T.sizeAdvice.test(probe))
  add('sizes', T.sizes.test(probe) && !topics.includes('size_advice'))
  add('stock', T.stock.test(probe))
  add('material', T.material.test(probe))
  add('care', T.care.test(probe))
  add('fit', T.fit.test(probe) && !topics.includes('size_advice'))
  add('description', T.description.test(probe))
  add('images', T.images.test(probe))
  add('compare', T.compare.test(probe))
  add('recommend', T.recommend.test(probe) && !topics.includes('size_advice'))

  // "Сайн байна уу" contains "байна уу", but a greeting on its own asks nothing.
  const greeting = isGreeting(text) || isGreeting(norm)
  if (greeting) topics.length = 0
  const sizes = parseSizes(text, norm)
  const orderNumber = /(?:mn|мн)\s*-?\s*(\d{5,9})/iu.exec(text)?.[1]
  const policyMatch = POLICY.find(([, re]) => re.test(probe))?.[0] ?? null
  // "Хүргэлт хэд хоног вэ" is a delivery-time question even though it also says "хүргэлт".
  const policy = policyMatch === 'delivery' && POLICY.find(([k]) => k === 'delivery_time')![1].test(probe) ? 'delivery_time' : policyMatch

  return {
    raw: text,
    norm,
    probe,
    script: scriptOf(text),
    greeting,
    thanks: isThanksOnly(text) || isThanksOnly(norm),
    handoff,
    buy: (BUY_INTENT.test(probe) || ADD_TO_CART.test(probe)) && !PICKUP_QUESTION.test(probe),
    addToCart: ADD_TO_CART.test(probe),
    chatHere: CHAT_ORDER_HERE.test(probe),
    yes: YES.test(text) || YES.test(norm),
    no: NO.test(text) || NO.test(norm),
    policy,
    topics,
    deictic: T.deictic.test(norm),
    colors: colorMentions(norm),
    sizes,
    numbers: bareNumbers(norm),
    quantity: parseQuantity(norm, text),
    maxPrice,
    minPrice,
    cheapest: T.cheapest.test(probe),
    priciest: T.priciest.test(probe),
    catalogQuestion: T.catalog.test(norm) || T.catalog.test(text.toLowerCase()),
    // ("ямар размер / өнгө / үнэ … байдаг" asks about a product, not a browse.)
    browse: /(?:^|\s)ямар(?:\s+ямар)?\s+(?!(?:размер|хэмжээ|өнгө|үнэ|материал|даавуу)\S*\s)(?:\S+\s+){1,2}(?:байна|байгаа|бий|байдаг|зардаг)|(?:^|\s)юу\s+(?:байна|байгаа)|what\s+\S+\s+do\s+you\s+have/iu.test(norm),
    tags: TAG_PATTERNS.filter(([, re]) => re.test(probe)).map(([tag]) => tag),
    audience: /(?:эмэгтэй|эмэгтэйчүүд|охид|бүсгүй|women|female|\bher\b)/iu.test(probe)
      ? 'women'
      : /(?:эрэгтэй|эрчүүд|залуу|\bmen\b|male|\bhim\b)/iu.test(probe)
        ? 'men'
        : null,
    // Only "children's …" itself; "хүүхдэдээ бэлэг" (a gift for my child) still searches the catalogue.
    kids: /(?:хүүхдийн|нярайн|huuhdiin|huuhdin|\bkids?\b|\bchildren'?s\b|\bbaby\b)/iu.test(`${text} ${norm}`),
    garments: garmentMentions(norm),
    numbered: parseNumberedChoice(text) ?? parseNumberedChoice(norm),
    orderNumber: orderNumber ? `MN-${orderNumber}` : null,
    phone: parsePhone(text),
  }
}

// ---------------------------------------------------------------------------
// Which products a message names
// ---------------------------------------------------------------------------

/** Not distinctive in a name: "өвлийн хувцас" asks for winter clothes, not for «Өвлийн пуховик». */
const NAME_STOP = new Set(['ба', 'болон', 'and', 'the', 'with', 'өвлийн', 'зуны', 'намрын', 'хаврын'])

function nameTokens(p: CatalogProduct): string[] {
  return normalizeText(p.name)
    .split(' ')
    .filter((w) => w.length >= 3 && !NAME_STOP.has(w))
}

function tokenMatch(messageToken: string, nameToken: string): boolean {
  if (messageToken === nameToken) return true
  if (isCaseSuffixedForm(messageToken, nameToken) && messageToken.startsWith(nameToken)) return true
  return nameToken.length >= 5 && isOneEditApart(messageToken, nameToken)
}

/** Latin spellings of our (Cyrillic) names: "oksford" ~ "оксфорд", "noolooran" ~ "ноолууран". */
function phoneticMatch(messageToken: string, nameToken: string): boolean {
  const a = phoneticLatinText(messageToken)
  const b = phoneticLatinText(nameToken)
  return a.length >= 3 && b.length >= 3 && (a === b || (b.length >= 4 && phoneticTokenMatches(a, b) && a[0] === b[0]))
}

const matches = (m: string, t: string) => tokenMatch(m, t) || (/[a-z]/.test(m) && !/[a-z]/.test(t) && phoneticMatch(m, t))

export interface ProductRefs {
  /** Products the message names, best first. One product = a clear reference; several = ask which. */
  named: CatalogProduct[]
  /** The top match used a word only that product's name has, or its whole name. */
  strong: boolean
  /** Products of a garment type the message mentions ("цамц", "өмд"), name matches first. */
  typed: CatalogProduct[]
}

/**
 * Products named by their distinctive name words. A product counts as named when
 * the message covers its whole name, uses a word only its name has ("оксфорд",
 * "hoodie"), or matches two of its words; a tie between equally good products is
 * returned as several (the caller asks which one).
 */
export function productRefs(u: Pick<Understood, 'norm' | 'garments'>, catalog: CatalogProduct[]): ProductRefs {
  const msg = u.norm.split(' ').filter(Boolean)
  const frequency = new Map<string, number>()
  for (const p of catalog) for (const t of new Set(nameTokens(p))) frequency.set(t, (frequency.get(t) ?? 0) + 1)

  const scored = catalog
    .map((p) => {
      const tokens = nameTokens(p)
      const matched = tokens.filter((t) => msg.some((m) => matches(m, t)))
      const unique = matched.filter((t) => frequency.get(t) === 1).length
      const full = matched.length === tokens.length && tokens.length > 0
      const score = unique * 2 + matched.length + (full ? 1 : 0)
      const qualifies = matched.length > 0 && (unique > 0 || full || matched.length >= 2)
      return { p, score, qualifies, strong: unique > 0 || full }
    })
    .filter((s) => s.qualifies)
    .sort((a, b) => b.score - a.score)

  let named: CatalogProduct[] = []
  let strong = false
  if (scored.length) {
    const top = scored[0].score
    named = scored.filter((s) => s.score === top).map((s) => s.p)
    strong = scored[0].strong
  }

  const typed: CatalogProduct[] = []
  for (const g of u.garments) {
    const byName = catalog.filter((p) => normalizeText(p.name).split(' ').some((w) => tokenMatch(w, g.word) || tokenMatch(g.word, w)))
    const byCategory = catalog.filter((p) => g.categories.includes(p.categorySlug))
    for (const p of [...byName, ...byCategory]) if (!typed.includes(p)) typed.push(p)
  }
  return { named, strong, typed }
}

/** Is the product one of the garment types the message mentions (or does it mention none)? */
export function fitsGarment(p: CatalogProduct, u: Pick<Understood, 'garments'>): boolean {
  if (u.garments.length === 0) return true
  return u.garments.some(
    (g) => g.categories.includes(p.categorySlug) || normalizeText(p.name).split(' ').some((w) => tokenMatch(w, g.word) || tokenMatch(g.word, w)),
  )
}
