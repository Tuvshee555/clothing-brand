// Pure aggregation over stored assistant replies (their metadata) for the AI
// Chatbot analytics (Lorentz analytics.ts at 69e4110, adapted). Nothing here
// reads the database; the query passes the rows in.

export interface ReplyRow {
  createdAt: Date
  metadata: unknown
}

export interface CustomerRow {
  metadata: unknown
}

type Meta = { intent?: string; mode?: string; durationMs?: number; handoff?: string | null; events?: string[]; productIds?: string[] }

export interface ActivitySummary {
  replies: number
  aiReplies: number
  rulesReplies: number
  intents: Record<string, number>
  handovers: number
  handoversByReason: Record<string, number>
  unanswered: number
  notInCatalogue: number
  variantChecks: number
  variantUnavailable: number
  funnel: { productQuestions: number; purchaseIntent: number; offers: number; addedToCart: number; chatOrdersStarted: number; chatOrdersCreated: number }
  aiRejected: number
  aiErrors: number
  avgDurationMs: number
  p95DurationMs: number
  /** productId → times a reply was about it. */
  products: Record<string, number>
  scripts: { cyrillic: number; latin: number; other: number }
}

const metaOf = (value: unknown): Meta => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Meta) : {})
const bump = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1
}

export function summarizeReplies(replies: ReplyRow[], customers: CustomerRow[] = []): ActivitySummary {
  const s: ActivitySummary = {
    replies: replies.length,
    aiReplies: 0,
    rulesReplies: 0,
    intents: {},
    handovers: 0,
    handoversByReason: {},
    unanswered: 0,
    notInCatalogue: 0,
    variantChecks: 0,
    variantUnavailable: 0,
    funnel: { productQuestions: 0, purchaseIntent: 0, offers: 0, addedToCart: 0, chatOrdersStarted: 0, chatOrdersCreated: 0 },
    aiRejected: 0,
    aiErrors: 0,
    avgDurationMs: 0,
    p95DurationMs: 0,
    products: {},
    scripts: { cyrillic: 0, latin: 0, other: 0 },
  }
  const durations: number[] = []
  for (const row of replies) {
    const m = metaOf(row.metadata)
    if (m.intent) bump(s.intents, m.intent)
    if (m.mode === 'ai') s.aiReplies++
    else s.rulesReplies++
    if (typeof m.durationMs === 'number' && Number.isFinite(m.durationMs)) durations.push(m.durationMs)
    if (m.handoff) {
      s.handovers++
      bump(s.handoversByReason, m.handoff)
    }
    for (const id of m.productIds ?? []) bump(s.products, id)
    const events = Array.isArray(m.events) ? m.events : []
    if (m.intent === 'product') s.funnel.productQuestions++
    for (const e of events) {
      if (e === 'unanswered') s.unanswered++
      else if (e === 'not_in_catalogue') s.notInCatalogue++
      else if (e === 'variant_check') s.variantChecks++
      else if (e === 'variant_unavailable') s.variantUnavailable++
      else if (e === 'purchase_intent') s.funnel.purchaseIntent++
      else if (e === 'offer') s.funnel.offers++
      else if (e === 'added_to_cart') s.funnel.addedToCart++
      else if (e === 'chat_order_started') s.funnel.chatOrdersStarted++
      else if (e === 'chat_order_created') s.funnel.chatOrdersCreated++
      else if (e === 'ai_rejected') s.aiRejected++
      else if (e === 'ai_error') s.aiErrors++
    }
  }
  for (const c of customers) {
    const script = (metaOf(c.metadata) as { script?: string }).script
    if (script === 'latin' || script === 'cyrillic') s.scripts[script]++
    else s.scripts.other++
  }
  if (durations.length) {
    const sorted = [...durations].sort((a, b) => a - b)
    s.avgDurationMs = Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
    s.p95DurationMs = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
  }
  return s
}

export const INTENT_LABELS: Record<string, string> = {
  product: 'Барааны асуулт',
  search: 'Хайлт, шүүлт',
  clarify: 'Тодруулга',
  policy: 'Нөхцөл (хүргэлт, буцаалт…)',
  order_status: 'Захиалгын төлөв',
  purchase: 'Худалдан авах',
  chat_order: 'Чат захиалга',
  chat_order_created: 'Захиалга үүссэн',
  chat_order_failed: 'Захиалга амжилтгүй',
  purchase_cancelled: 'Захиалга цуцалсан',
  added_to_cart: 'Сагсанд нэмсэн',
  handoff: 'Ажилтан хүссэн',
  contact_capture: 'Холбоо барих мэдээлэл',
  faq: 'Эзэмшигчийн асуулт, хариулт',
  greeting: 'Мэндчилгээ',
  thanks: 'Талархал',
  ack: 'Зөвшөөрөл',
  catalog: 'Каталог',
  recommendation: 'Зөвлөмж',
  ai: 'AI хариулт',
  fallback: 'Хариулж чадаагүй',
  error: 'Алдаа',
}
