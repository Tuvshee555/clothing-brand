// Pure understanding of shopper questions (Mongolian Cyrillic, Latin-script
// Mongolian and simple English). It extracts *constraints* only — the answers
// themselves always come from database queries.
import { COLOR_FAMILIES, normalizeText, type ColorFamily } from './catalog-filter'

export type PolicyTopic = 'delivery' | 'returns' | 'exchange' | 'ordering' | 'payment' | 'privacy' | 'change_order' | 'contact'

export interface ParsedQuestion {
  text: string
  policy: PolicyTopic | null
  sizes: string[]
  colors: ColorFamily[]
  maxPrice: number | null
  minPrice: number | null
  cheapest: boolean
  priciest: boolean
  compare: boolean
  stockQuestion: boolean
  winter: boolean
  greeting: boolean
  /** Words left for product matching after constraint words are removed. */
  productQuery: string
}

const POLICY_PATTERNS: [PolicyTopic, RegExp][] = [
  ['change_order', /(захиалг\S*\s+(өөрчл|солих|цуцл)|өөрчлөх\s+боломж|change (my )?order|cancel)/],
  ['exchange', /(хэмжээ\S*\s+соли|солиул|солих|exchange)/],
  ['returns', /(буцаа|буцаах|буцааж|return|refund)/],
  ['delivery', /(хүргэлт|хүргэх|хүргэдэг|хүргүүл|delivery|shipping|орон нутаг|аймаг\S* руу)/],
  ['payment', /(төлбөр|төлөх|qpay|карт|бэлэн|payment|pay\b)/],
  ['ordering', /(яаж захиал|хэрхэн захиал|захиалах (вэ|уу|бол)|how (do|to) (i )?order|захиалга өгөх)/],
  ['privacy', /(нууцлал|хувийн мэдээлэл|privacy)/],
  ['contact', /(холбоо барих|утас\S* дугаар|и-?мэйл|contact|хаяг\S* хаана|дэлгүүр хаана)/],
]

const SIZE_RE = /(?:^|[\s,(/])(xxs|xs|s|m|l|xl|xxl|2xl|3xl)(?=$|[\s,).?!/])/gi
const WAIST_RE = /(?:^|\s)(2[6-9]|3[0-8])(?:\s*(?:размер|хэмжээ|size|inch|инч))/gi

/** "200,000", "200 000", "200000", "200 мянга", "200k" → 200000 */
function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  const thousands = /(\d+(?:[.,]\d+)?)\s*(мянга|мянган|k|к)\b/.exec(s)
  if (thousands) return Math.round(Number(thousands[1].replace(',', '.')) * 1000)
  const millions = /(\d+(?:[.,]\d+)?)\s*(сая|m\b)/.exec(s)
  if (millions) return Math.round(Number(millions[1].replace(',', '.')) * 1_000_000)
  const digits = s.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n >= 1000 ? n : null
}

const AMOUNT = String.raw`(\d[\d\s,.]*\d|\d)\s*(?:мянга|мянган|k|к|сая)?\s*(?:₮|төгрөг|tugrik|mnt)?`

export function parsePriceLimits(text: string): { maxPrice: number | null; minPrice: number | null } {
  const t = text.toLowerCase()
  let maxPrice: number | null = null
  let minPrice: number | null = null
  const below = new RegExp(`${AMOUNT}\\s*(?:-?(?:аас|ээс|оос|өөс|с))?\\s*(?:доош|бага|хүртэл|дотор|хямд)`, 'u').exec(t)
  const under = new RegExp(`(?:under|below|less than|max|хүртэл)\\s*${AMOUNT}`, 'u').exec(t)
  const above = new RegExp(`${AMOUNT}\\s*(?:-?(?:аас|ээс|оос|өөс|с))?\\s*(?:дээш|их|илүү)`, 'u').exec(t)
  const over = new RegExp(`(?:over|above|more than|min)\\s*${AMOUNT}`, 'u').exec(t)
  const pick = (m: RegExpExecArray | null) => (m ? parseAmount(m[0].replace(/(доош|бага|хүртэл|дотор|хямд|дээш|их|илүү|under|below|less than|max|over|above|more than|min)/g, '')) : null)
  maxPrice = pick(below) ?? pick(under)
  minPrice = pick(above) ?? pick(over)
  return { maxPrice, minPrice }
}

export function parseSizes(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(SIZE_RE)) {
    const size = m[1].toUpperCase().replace('2XL', 'XXL')
    // A lone "s"/"m" in Mongolian text is rare but "L размер", "M хэмжээ" is common; accept all.
    found.add(size)
  }
  for (const m of text.matchAll(WAIST_RE)) found.add(m[1])
  return [...found]
}

export function parseColors(text: string): ColorFamily[] {
  const t = normalizeText(text)
  const out: ColorFamily[] = []
  for (const [family, def] of Object.entries(COLOR_FAMILIES) as [ColorFamily, (typeof COLOR_FAMILIES)[ColorFamily]][]) {
    if (def.words.some((w) => new RegExp(`(^|\\s)${w}`, 'u').test(t))) out.push(family)
  }
  // "нүүрсэн саарал" also contains "саарал"; "хар" inside "харах" is excluded by the word-start rule.
  return out.filter((f) => !(f === 'black' && /хар(ах|уул|ж|сан|ъя)/u.test(t) && !/(^|\s)хар(\s|$)/u.test(t)))
}

const CONSTRAINT_WORDS =
  /(хамгийн|хямд|үнэтэй|доош|дээш|хүртэл|бага|илүү|төгрөг|₮|размер|хэмжээ|size|байгаа|байна|юу|уу|үү|вэ|бэ|ямар|аль|танайд|танай|надад|хэрэгтэй|үнэ|өнгө|өнгийн|ширхэг|үлдэгдэл|бий|бол|л\b|of|in|do|you|have|any|what|which|is|are|the|cheapest|available|price|ялгаа|харьцуул|эдгээр|энэ|тэр|өвөл\S*|winter|тохирох|зөвлө\S*|санал болго\S*)/gu

export function parseQuestion(raw: string): ParsedQuestion {
  const text = raw.slice(0, 600)
  const lower = text.toLowerCase()
  const policy = POLICY_PATTERNS.find(([, re]) => re.test(lower))?.[0] ?? null
  const { maxPrice, minPrice } = parsePriceLimits(lower)
  const sizes = parseSizes(text)
  const colors = parseColors(text)
  let productQuery = normalizeText(text)
  for (const family of colors) for (const w of COLOR_FAMILIES[family].words) productQuery = productQuery.replace(new RegExp(`(^|\\s)${w}\\S*`, 'gu'), ' ')
  productQuery = productQuery
    .replace(/\d[\d\s,.]*/g, ' ')
    .replace(SIZE_RE, ' ')
    .replace(CONSTRAINT_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    text,
    policy,
    sizes,
    colors,
    maxPrice,
    minPrice,
    cheapest: /(хамгийн хямд|хямдхан|cheapest|lowest price|хамгийн бага үнэ)/.test(lower),
    priciest: /(хамгийн үнэтэй|most expensive|хамгийн өндөр үнэ)/.test(lower),
    compare: /(ялгаа|харьцуул|difference|compare|аль нь дээр|ялгаатай)/.test(lower),
    stockQuestion: /(байгаа юу|байна уу|үлдсэн|үлдэгдэл|бий юу|available|in stock|авч болох|авах боломж)/.test(lower) || sizes.length > 0,
    winter: /(өвөл|өвлийн|хүйтэн|дулаан|winter|warm)/.test(lower),
    greeting: /^(сайн уу|сайн байна уу|hi|hello|hey|мэнд)\b/.test(lower.trim()),
    productQuery,
  }
}
