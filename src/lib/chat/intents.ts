// Business-agnostic intent patterns of the chat engine, ported from the Lorentz
// commerce chatbot (turn.ts, commerce/purchase.ts, handoffDetection.ts,
// greetingPhrases.ts at 69e4110). Every pattern is tested against intentProbe()
// output — the customer's text plus its Cyrillic normal form — so Latin
// spellings reach the same branches as Cyrillic.
import { normalizePhone } from '@/lib/phone'

// --- Hand-over triggers ----------------------------------------------------

/** A customer saying they paid. The assistant never confirms a payment itself. */
export const PAYMENT_CLAIM = /(?:шилжүүлсэн|шилжүүлчихсэн|төлчихсөн|төлсөн|мөнгөө\s+(?:хийсэн|шилжүүлсэн)|i\s+(?:have\s+)?(?:paid|transferred)|payment\s+(?:sent|made|done))/iu
/** …unless it is a question about how to pay. */
export const PAYMENT_QUESTION = /(?:яаж|хаана|хэрхэн|how|where|can\s+i|болох\s+уу|боломжтой\s+юу)/iu

/** Explicit requests for a person (Cyrillic, Latin via the probe, English). */
export const HUMAN_REQUEST =
  /(?:хүнтэй|хүн\s+(?:холбогд|ярь|ярих|хэрэгтэй|байгаа\s*юу|байна\s*уу|алга)|ажилтан(?:тай)?\s*(?:холбо|ярь|ярих|хэрэгтэй|байгаа|байна)|ажилтантай|ажилтанд\s+(?:холбо|шилжүүл)|оператор|ярих\s+хүн|хүн\s+(?:байгаа|байна)\s+(?:юу|уу)|жинхэнэ\s+хүн|(?:чатбот|робот|бот)\s+биш|холбож\s+өг|менежер|хүн\s+хариул|human|operator|real\s+person|someone\s+to\s+talk|talk\s+to\s+(?:a\s+)?(?:person|human|someone)|staff\s+member|not\s+a\s+bot|live\s+agent)/iu

/** Something went wrong with a delivered order: a person handles it. */
export const COMPLAINT =
  /(?:гомдол|эвдэрсэн|эвдэрч|урагдсан|гэмтэлтэй|гэмтсэн|согогтой|буруу\s+(?:бараа|бүтээгдэхүүн|өнгө|хэмжээ|размер)\S*.{0,20}ир|(?:өөр|буруу)\s+(?:өнгө|хэмжээ|размер|бараа)\S*\s+ирсэн|мөнгөө\s+буцааж\s+өг|complain|damaged|broken|defect|wrong\s+(?:item|product|size|colou?r)|refund\s+me)/iu

/** "You're wrong", "useless bot", "isn't there a real person": frustration hands over too. */
export function isFrustrated(text: string): boolean {
  const t = text.toLowerCase().normalize('NFKC')
  return [
    /\byou(?:r|'re| are)?\s+(?:wrong|bad|useless|annoying)\b/i,
    /\b(?:chat)?bot\b.{0,40}\b(?:wrong|bad|useless|annoying)\b/i,
    /буруу\s+(?:байна|хариул|хэл|өг)/i,
    /худлаа\s+(?:байна|хэл|хариул)/i,
    /алдаатай\s+(?:байна|хариул)/i,
    /зөв\s+хариул/i,
    /(?:чатбот|бот).{0,40}(?:буруу|худлаа|алдаатай|муу)/i,
    /арчаагүй|archaag(?:ui|umda|u?mda)?/i,
    /уур\s+хүр|уурлуул|дургүй\s+хүр/i,
    /хүн\s*(?:байхгүй|алга|үгүй)\s*(?:юм\s*)?(?:уу|бэ)?/i,
    /робот\s*биш/i,
  ].some((pattern) => pattern.test(t))
}

// --- Purchase and confirmation ---------------------------------------------

export const BUY_INTENT =
  /(?:^|[^\p{L}])(?:авъя|авья|авая|авмаар|авна|авч\s+болох|авах\s+(?:гэсэн|хүсэлтэй|боломж|гэж)|худалдаж\s+ав|худалдан\s+ав|захиалъя|захиалья|захиаля|захиалмаар|захиална|захиалах\s+(?:гэсэн|гэж|хүсэлтэй|болох\s+уу|боломжтой\s+юу)|захиалж\s+болох|захиалга\s+(?:өгье|өгъе|өгмөөр|өгнө|хийе|хийье|хиймээр|хийх\s+гэсэн|үүсгэ)|нэгийг\s+ав|\bbuy\b|\bpurchase\b|order\s+(?:it|one|this|that|now|the|a\b|two|2|3)|i(?:'ll|\s+will|\s+want\s+to|\s+would\s+like\s+to|'d\s+like\s+to)\s+(?:buy|order|take|get)|i'?ll\s+take\b|want\s+to\s+(?:buy|order)|place\s+(?:an?\s+)?order|take\s+(?:it|one|this))(?=$|[^\p{L}])/iu
/** Asking whether an order can be collected in person is never a purchase. */
export const PICKUP_QUESTION = /(?:очиж|ирж|өөрөө)\s+(?:\p{L}+\s+)?ав(?:ч|ах|на|ъя)|(?:ochij|irj|uuruu)\s+av|pick\s*-?\s*(?:\p{L}+\s+){0,2}up|collect\s+(?:it|in\s+person)/iu
/** Continue the order inside the chat instead of the cart. */
export const CHAT_ORDER_HERE =
  /(?:энд\s+захиал|энд\s+авъя|энд\s+үүсг|чатаар\s+(?:захиал|авъя|үүсг|өг)|энд\s+бичээд|энд\s+хийе|here\s+in\s+(?:the\s+)?chat|order\s+here|in\s+(?:the\s+)?chat|via\s+chat|through\s+chat)/iu
export const ADD_TO_CART = /(?:сагсанд\s*(?:нэм|хий|оруул)|сагслах|сагсандаа\s*(?:нэм|хий)|add\s+(?:it\s+|this\s+)?to\s+(?:my\s+|the\s+)?(?:cart|bag))/iu
export const YES =
  /^\s*(?:тийм|тиймээ|тийм\s*ээ|за|зөв|болно|болноо|баталгаажуул\p{L}*|бататгая|батлая|ok|okay|yes|yep|yeah|sure|confirm|confirmed|👍|✅)(?:[\s,.!]+(?:тийм|баталгаажуул\p{L}*|болно|за|зөв|ok|yes|please))*[\s!.]*$/iu
export const NO =
  /^\s*(?:үгүй|үгүй\s*ээ|болих|болино|болилоо|больё|цуцал\p{L}*|хэрэггүй|болихоо|no|nope|cancel|stop|never\s*mind)(?:[\s,.!]+(?:болих|болино|цуцал\p{L}*|үгүй|хэрэггүй|it|that))*[\s!.]*$/iu

// --- Small talk -------------------------------------------------------------

const GREETING_CORE = new Set(['сайн', 'сайнуу', 'мэнд', 'мэндээ', 'мэндчилье', 'амар', 'амарсан', 'sain', 'sn', 'hi', 'hii', 'hello', 'hey', 'сонин', 'сайхан'])
const GREETING_FILLER = new Set(['байна', 'бна', 'бну', 'бнуу', 'бн', 'уу', 'юу', 'өдрийн', 'оройн', 'өглөөний', 'bn', 'bna', 'bnu', 'bnuu', 'baina', 'bainuu', 'uu', 'yu', 'байгаа', 'there'])
const THANKS_CORE = new Set(['баярлалаа', 'баярлаа', 'ачлалаа', 'bayrlalaa', 'bayrlaa', 'bayrla', 'bairlalaa', 'thanks', 'thank', 'thx'])
const THANKS_FILLER = new Set(['за', 'zaa', 'za', 'ok', 'ок', 'okay', 'маш', 'их', 'танд', 'тань', 'аа', 'you', 'very', 'much', 'хүлээж', 'хүлээе', 'бай', 'байя', 'байъя'])

const tokens = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** 1–5 words, all greeting words, at least one core word ("сайн байна уу", "Sn bnuu"). */
export function isGreeting(text: string): boolean {
  const words = tokens(text)
  if (words.length === 0 || words.length > 5) return false
  let core = false
  for (const w of words) {
    if (GREETING_CORE.has(w)) core = true
    else if (!GREETING_FILLER.has(w)) return false
  }
  return core
}

/** A bare thank-you asks nothing; it must never borrow the previous turn's products. */
export function isThanksOnly(text: string): boolean {
  const words = tokens(text)
  if (words.length === 0 || words.length > 4) return false
  let core = false
  for (const w of words) {
    if (THANKS_CORE.has(w)) core = true
    else if (!THANKS_FILLER.has(w)) return false
  }
  return core
}

// --- Picks, quantities, contact details -------------------------------------

/** "1", "2)", "2-р", "хоёрдугаар", "эхнийх нь", "the first one": a pick from the last numbered list. */
export function parseNumberedChoice(text: string): { index: number } | null {
  if (/^\s*(?:the\s+)?first(?:\s+one)?[.!?]?\s*$/i.test(text) || /^\s*(?:эхнийх?|нэгдүгээр|ehnii(?:h)?|ehnih)(?:\s+(?:нь|ni))?[.!?]?\s*$/iu.test(text)) return { index: 0 }
  const words: Record<string, number> = { хоёрдугаар: 1, гуравдугаар: 2, дөрөвдүгээр: 3, тавдугаар: 4, hoyordugaar: 1, guravdugaar: 2 }
  const w = /^\s*(\p{L}+)(?:\s+(?:нь|ni))?[.!?]?\s*$/iu.exec(text)
  if (w && words[w[1].toLowerCase()] !== undefined) return { index: words[w[1].toLowerCase()] }
  if (/^\s*(?:the\s+)?last(?:\s+one)?[.!?]?\s*$/i.test(text) || /^\s*(?:сүүлийнх|suuliinh)(?:\s+(?:нь|ni))?[.!?]?\s*$/iu.test(text)) return { index: -1 }
  const ordinal = /^\s*(\d{1,2})\s*-?\s*(?:р|дугаар|дүгээр|дахь|dahi|dah|dugaar|r)(?:\s+(?:нь|ni))?\s*[.!?]?\s*$/iu.exec(text)
  if (ordinal) return { index: Number(ordinal[1]) - 1 }
  const numbered = /^\s*(\d{1,2})\s*[.)]?\s*$/u.exec(text)
  return numbered ? { index: Number(numbered[1]) - 1 } : null
}

const NUMBER_WORDS: Record<string, number> = {
  нэг: 1, нэгийг: 1, хоёр: 2, хоёрыг: 2, гурав: 3, гурван: 3, гуравыг: 3, дөрөв: 4, дөрвөн: 4, тав: 5, таван: 5, зургаа: 6, зургаан: 6,
  долоо: 7, долоон: 7, найм: 8, найман: 8, ес: 9, есөн: 9, арав: 10, арван: 10, one: 1, two: 2, three: 3, four: 4, five: 5,
}

/** "2 ширхэг", "2-ыг", "x2", "хоёр ширхэг", "гурван ш" → the quantity, or null. `probe` is the normalized text. */
export function parseQuantity(probe: string, raw = probe): number | null {
  const explicit =
    /(?:^|\s)(\d{1,3})\s*(?:ширхэг|шир|ш|pcs?|pieces?|units?|x|×|ыг|ийг|г)(?=\s|$)/u.exec(probe) ||
    /(?:^|\s)(?:x|×)\s*(\d{1,3})(?=\s|$)/u.exec(probe) ||
    /(\d{1,3})\s*-\s*(?:ыг|ийг|г)/u.exec(raw)
  if (explicit) return clamp(Number(explicit[1]))
  const words = probe.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const value = NUMBER_WORDS[words[i]]
    if (value && /^(?:ширхэг|шир|ш|pcs?|pieces?|авъя|авах|захиалах|захиалъя|авна|авмаар)$/u.test(words[i + 1] || '')) return clamp(value)
    if (value && /(?:ыг|ийг)$/u.test(words[i])) return clamp(value)
  }
  return null
}
const clamp = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.min(999, Math.trunc(n)) : null)

/** An 8-digit Mongolian phone number in free text ("9911 2233", "+976-99112233"), normalised. */
export function parsePhone(text: string): string | null {
  for (const m of text.matchAll(/(?:\+?976[\s-]?)?(\d[\d\s-]{6,12}\d)/g)) {
    const phone = normalizePhone(m[0])
    if (phone) return phone
  }
  return null
}

/** The name in "Бат 9911 2233" / "миний нэр Сараа" (letters only, at most three words). */
export function parseName(text: string): string {
  const withoutNumbers = text.replace(/\+?976/g, ' ').replace(/\d[\d\s-]*\d|\d/g, ' ')
  const words = withoutNumbers
    .replace(/(?:миний\s+нэр|намайг|нэр|name(?:\s+is)?|ner|utas|утас|дугаар|phone|my)[:：]?/giu, ' ')
    .replace(/[^\p{L}\s'-]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 3)
  return words.join(' ').slice(0, 60)
}
