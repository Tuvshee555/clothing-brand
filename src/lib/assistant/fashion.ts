// Clothing vocabulary for the MANAN shopping assistant: how shoppers write
// garments, colours and sizes (Cyrillic, Latin-script Mongolian, English), and
// how a colour or size in a message maps onto a product's *actual* colours and
// sizes from the database. Generic Mongolian lives in lib/chat; nothing here
// lists products, prices or stock.
import { intentProbe, normText, type Alias } from '@/lib/chat/text'
import { colorFamily, normalizeText } from '@/lib/catalog-filter'

/** Latin / English spellings of garment, material, colour and size words (applied before the generic aliases). */
export const FASHION_ALIASES: Alias[] = [
  // garments
  [/\b(?:tsamts|tsamtsnii|tsamtsaa|tsamtsiig|camc|tsamc|shirt|shirts)\b/gi, 'цамц'],
  [/\b(?:umd|umdnii|umdni|umdiig|umdee|pants|trousers)\b/gi, 'өмд'],
  [/\b(?:hurem|huremnii|huremee|jacket)\b/gi, 'хүрэм'],
  [/\b(?:palito|palto|paltoo|paliti|coat)\b/gi, 'пальто'],
  [/\b(?:puhovik|puhovk|puhavik|puffer)\b/gi, 'пуховик'],
  [/\b(?:jins|jinsen|jinsee|jeans|denim)\b/gi, 'жинс'],
  [/\b(?:sviter|switer|svitr|sweater)\b/gi, 'свитер'],
  [/\b(?:svitshot|svitshort|sweatshirt)\b/gi, 'свитшот'],
  [/\b(?:futbolk|futbolka|futbolko|podvolk|podvolka|tee|t-shirt|tshirt)\b/gi, 'футболк'],
  [/\b(?:kardigan|cardigan)\b/gi, 'кардиган'],
  [/\b(?:malgai|malgaig|hat|cap|beanie)\b/gi, 'малгай'],
  [/\b(?:tsunh|tsuunh|bag|tote)\b/gi, 'цүнх'],
  [/\b(?:bus|busnii|belt)\b/gi, 'бүс'],
  [/\b(?:oroolt|orooltoo|scarf)\b/gi, 'ороолт'],
  [/\b(?:hantaaz|vest)\b/gi, 'хантааз'],
  [/\b(?:hudi|hudee|hoodi)\b/gi, 'hoodie'],
  // materials
  [/\b(?:noolur|nooluur|nooluuran|cashmere)\b/gi, 'ноолуур'],
  [/\b(?:noos|noosnii|noosun|wool)\b/gi, 'ноос'],
  [/\b(?:ars|arsan|leather)\b/gi, 'арьс'],
  [/\b(?:maalinga|maalingan|linen)\b/gi, 'маалинга'],
  [/\b(?:huvun|cotton)\b/gi, 'хөвөн'],
  [/\b(?:material|materiali|materialiig)\b/gi, 'материал'],
  [/\b(?:daavuu|daavuun)\b/gi, 'даавуу'],
  // colours (multi-word first)
  [/\b(?:har\s*huh|har\s*hoh|navy)\b/gi, 'хар хөх'],
  [/\b(?:tsaivar\s*saaral|light\s*gr[ae]y)\b/gi, 'цайвар саарал'],
  [/\b(?:tsaivar\s*tsenher|light\s*blue)\b/gi, 'цайвар цэнхэр'],
  [/\b(?:har|haraar|hariig|black)\b/gi, 'хар'],
  [/\b(?:tsagaan|tsagaanaar|white)\b/gi, 'цагаан'],
  [/\b(?:saaral|saarlaar|gr[ae]y)\b/gi, 'саарал'],
  [/\b(?:ulaan|ulaanaar|red)\b/gi, 'улаан'],
  [/\b(?:nogoon|nogoonoor|green|olive)\b/gi, 'ногоон'],
  [/\b(?:tsenher|tsenhreer|blue)\b/gi, 'цэнхэр'],
  [/\b(?:huh|hoh)\b/gi, 'хөх'],
  [/\b(?:huren|hvren|hurenee|brown)\b/gi, 'хүрэн'],
  [/\b(?:bor)\b/gi, 'бор'],
  [/\b(?:shargal|beige|camel)\b/gi, 'шаргал'],
  [/\b(?:shar|yellow|mustard)\b/gi, 'шар'],
  [/\b(?:tsaivar|caivar|light)\b/gi, 'цайвар'],
  [/\b(?:tsutsgii|cream)\b/gi, 'цөцгий'],
  [/\b(?:yagaan|pink)\b/gi, 'ягаан'],
  [/\b(?:latte)\b/gi, 'латте'],
  // sizes
  [/\b(?:razmer|razmeer|razmar|razmr|razmeriin|razmertai)\b/gi, 'размер'],
  [/\b(?:tom|tomdoh|tomdono)\b/gi, 'том'],
  [/\b(?:jijig|jijigdeh|jijigdene)\b/gi, 'жижиг'],
]

export const normShopper = (text: string) => normText(text, FASHION_ALIASES)
export const probeOf = (text: string) => intentProbe(text, FASHION_ALIASES)

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** Colour families the assistant reasons with (finer than the storefront filter: yellow, pink, …). */
export type Hue = 'black' | 'white' | 'grey' | 'beige' | 'brown' | 'blue' | 'green' | 'red' | 'yellow' | 'pink' | 'purple' | 'pattern'

/** Base colour words → hue. The *head* (last) word of a Mongolian colour name decides its hue: "хар хөх" is blue. */
const BASE_COLORS: Record<string, Hue> = {
  хар: 'black', цагаан: 'white', цөцгий: 'white', саарал: 'grey', шаргал: 'beige', латте: 'beige', элсэн: 'beige', хүрэн: 'brown',
  бор: 'brown', шоколад: 'brown', цэнхэр: 'blue', хөх: 'blue', ногоон: 'green', хаки: 'green', чидун: 'green', улаан: 'red',
  бордо: 'red', шар: 'yellow', ягаан: 'pink', нил: 'purple', судал: 'pattern', тартан: 'pattern',
}
/** Inflected forms shoppers use for colours ("хараар", "саарлыг", "цэнхрээр"). */
const INFLECTED: Record<string, string> = {
  хараар: 'хар', харыг: 'хар', харын: 'хар', цагааныг: 'цагаан', цагаанаар: 'цагаан', саарлыг: 'саарал', саарлаар: 'саарал',
  улааныг: 'улаан', улаанаар: 'улаан', ногооныг: 'ногоон', ногооноор: 'ногоон', цэнхрийг: 'цэнхэр', цэнхрээр: 'цэнхэр',
  хүрэнг: 'хүрэн', хүрнээр: 'хүрэн', хүрэнээр: 'хүрэн', шаргалыг: 'шаргал', шаргалаар: 'шаргал', шарыг: 'шар', ягааныг: 'ягаан',
}
/** Words that modify the following colour word ("цайвар саарал", "хар хөх"). */
const MODIFIERS = new Set(['цайвар', 'бараан', 'гүн', 'тод', 'дунд', 'түүхий', 'нүүрсэн', 'хар', 'элсэн', 'чидун', 'гичий', 'шаргал'])

export const HUE_LABELS: Record<Hue, string> = {
  black: 'хар', white: 'цагаан', grey: 'саарал', beige: 'шаргал', brown: 'хүрэн', blue: 'цэнхэр', green: 'ногоон', red: 'улаан',
  yellow: 'шар', pink: 'ягаан', purple: 'нил ягаан', pattern: 'хээтэй',
}

export interface ColorMention {
  /** The words as normalised ("цайвар саарал"). */
  phrase: string
  hue: Hue
}

const words = (normalized: string) => normalized.split(/\s+/).filter(Boolean).map((w) => INFLECTED[w] ?? w)

/** Colour phrases in a normalised message, longest first ("хар хөх" is one colour, not black + blue). */
export function colorMentions(normalized: string): ColorMention[] {
  const ws = words(normalized)
  const out: ColorMention[] = []
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]
    const next = ws[i + 1]
    if (MODIFIERS.has(w) && next && BASE_COLORS[next] && next !== w) {
      out.push({ phrase: `${w} ${next}`, hue: BASE_COLORS[next] })
      i++
      continue
    }
    if (BASE_COLORS[w] && !['нил', 'судал', 'тартан'].includes(w)) out.push({ phrase: w, hue: BASE_COLORS[w] })
  }
  return out
}

/**
 * The hues of one of our colour names: each colour phrase in it ("Цагаан, хар
 * хөх судал" is white and blue; "Хар хөх" is only blue), else the swatch family.
 */
export function huesOfColor(color: { name: string; hex: string }): Set<Hue> {
  const mentions = colorMentions(normalizeText(color.name))
  if (mentions.length) return new Set(mentions.map((m) => m.hue))
  return new Set([colorFamily(color.hex) as Hue])
}

export interface ColorMatch<C> {
  /** Our colours the customer named (exact name, or same head colour). */
  colors: C[]
  /** What the customer asked for, for "we don't have X" replies. */
  asked: ColorMention[]
}

/**
 * Which of the product's colours a message refers to. An exact colour name wins
 * ("цайвар саарал", "хар хөх"); otherwise a colour word matches our colours of
 * the same hue — "хар" never matches navy ("хар хөх") and "саарал" matches
 * "Цайвар саарал".
 */
export function matchColors<C extends { name: string; hex: string }>(normalized: string, colors: C[]): ColorMatch<C> {
  const text = ` ${normalized} `
  const asked = colorMentions(normalized)
  const exact = colors
    .map((c) => ({ c, n: normalizeText(c.name) }))
    .filter(({ n }) => n.length >= 3 && text.includes(` ${n} `))
    // "хар хөх" asked: our plain "Хар" is not what the customer named.
    .filter(({ n }) => !asked.some((a) => a.phrase !== n && a.phrase.split(' ').length > n.split(' ').length && a.phrase.includes(n)))
    .sort((a, b) => b.n.length - a.n.length)
  if (exact.length) {
    // Keep only exact names not covered by a longer exact name.
    const kept = exact.filter((e, i) => !exact.slice(0, i).some((longer) => longer.n.includes(e.n)))
    return { colors: kept.map((e) => e.c), asked }
  }
  if (asked.length === 0) return { colors: [], asked }
  const hues = new Set(asked.map((a) => a.hue))
  const byHue = colors.filter((c) => [...huesOfColor(c)].some((h) => hues.has(h)))
  // A modifier the customer used must also appear in our name ("цайвар цэнхэр" ≠ "Дунд цэнхэр").
  const modified = asked.filter((a) => a.phrase.includes(' '))
  const refined = modified.length ? byHue.filter((c) => modified.some((m) => normalizeText(c.name).includes(m.phrase.split(' ')[0]))) : byHue
  return { colors: modified.length ? refined : byHue, asked }
}

// ---------------------------------------------------------------------------
// Sizes
// ---------------------------------------------------------------------------

const SIZE_WORD = /(?:размер|хэмжээ|size|razmer|hemjee)/iu
const LETTER_SIZES: Record<string, string> = { xxs: 'XXS', xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: 'XXL', '2xl': 'XXL' }
/** Cyrillic letters shoppers type for sizes ("Л размер", "ХЛ"). */
const CYRILLIC_SIZES: Record<string, string> = { хс: 'XS', с: 'S', м: 'M', л: 'L', хл: 'XL', ххл: 'XXL', '2хл': 'XXL' }

/**
 * Sizes named in a message, canonical ("XL", "30", "ONE SIZE"). A lone lowercase
 * s/m/l inside a long Latin sentence is a particle as often as a size ("ene l bn"),
 * so it counts only next to a size word, written in capitals, or in a short message.
 */
export function parseSizes(raw: string, normalized: string): string[] {
  const found: string[] = []
  const add = (s: string) => !found.includes(s) && found.push(s)
  const hasSizeWord = SIZE_WORD.test(raw) || SIZE_WORD.test(normalized)
  const short = normalized.split(/\s+/).length <= 5
  for (const m of raw.matchAll(/(?<![\p{L}\d])(xxs|xs|2xl|xxl|xl|s|m|l)(?![\p{L}\d])/giu)) {
    const token = m[1]
    const single = token.length === 1
    if (single && token === token.toLowerCase() && !hasSizeWord && !short) continue
    add(LETTER_SIZES[token.toLowerCase()])
  }
  if (hasSizeWord) {
    for (const m of raw.matchAll(/(?<![\p{L}\d])(хс|ххл|2хл|хл|с|м|л)(?![\p{L}\d])/giu)) add(CYRILLIC_SIZES[m[1].toLowerCase()])
  }
  // Waist / belt sizes: "30 размер", "размер 28", "32-ын жинс" next to a size word.
  if (hasSizeWord) for (const m of normalized.matchAll(/(?<!\d)(2[6-9]|3[0-8]|80|85|90|95|100|105|110)(?!\d)/g)) add(m[1])
  if (/(?:нэг\s+хэмжээ|one\s+size|ганц\s+хэмжээ)/iu.test(normalized)) add('ONE SIZE')
  return found
}

/** Bare numbers that might be waist sizes when the product in focus has numeric sizes ("30 bga yu?"). */
export function bareNumbers(normalized: string): string[] {
  return [...normalized.matchAll(/(?<![\d,.])(\d{2,3})(?![\d,.]|\s*(?:₮|мянга|k|к|ширхэг|хоног|өдөр|цаг|минут))/gu)].map((m) => m[1])
}

// ---------------------------------------------------------------------------
// Garments
// ---------------------------------------------------------------------------

/**
 * Garment words and the categories they can mean. Mongolian "цамц" covers shirts
 * and knitted tops, "өмд" covers jeans too ("жинсэн өмд").
 */
export const GARMENT_GROUPS: { words: string[]; categories: string[] }[] = [
  { words: ['цамц', 'цамцны', 'цамцаа', 'цамцыг'], categories: ['shirts', 'knitwear', 't-shirts'] },
  { words: ['өмд', 'өмдний', 'өмдөө', 'өмдийг'], categories: ['trousers', 'jeans'] },
  { words: ['жинс', 'жинсний', 'жинсэн'], categories: ['jeans'] },
  { words: ['футболк', 'футболка', 'подволк'], categories: ['t-shirts'] },
  { words: ['hoodie', 'худи', 'свитшот'], categories: ['hoodies'] },
  { words: ['свитер', 'кардиган', 'сүлжмэл'], categories: ['knitwear'] },
  { words: ['хүрэм', 'хүрмийг', 'пальто', 'пуховик', 'хантааз', 'куртка'], categories: ['outerwear'] },
  { words: ['малгай', 'кепи', 'бейсболк', 'ороолт', 'цүнх', 'бүс'], categories: ['accessories'] },
]

/** Garment words in a normalised message, with the categories they may mean. */
export function garmentMentions(normalized: string): { word: string; categories: string[] }[] {
  const ws = normalized.split(/\s+/)
  const out: { word: string; categories: string[] }[] = []
  for (const g of GARMENT_GROUPS) {
    const hit = ws.find((w) => g.words.some((gw) => w === gw || (gw.length >= 4 && w.startsWith(gw))))
    if (hit) out.push({ word: g.words[0], categories: g.categories })
  }
  return out
}
