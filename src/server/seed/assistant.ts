// Seed for the AI Chatbot section: default settings, a few of the owner's own
// questions and answers, and fictional sample conversations so the admin shows
// what hand-overs and inquiries look like before any visitor has chatted.
// Sample chats are channel "sample": read-only, labelled «Жишээ», never
// anonymised or pruned, and visible to the public demo. Idempotent: fixed ids,
// rows are only added when missing.
import { inArray } from 'drizzle-orm'
import { defaultAssistantSettings } from '@/lib/assistant/settings'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'

export const SAMPLE_FAQS = [
  {
    question: 'Дэлгүүр дээр очиж үзэж болох уу?',
    answer: 'MANAN бол зөвхөн онлайн дэлгүүр (портфолио демо) — биет дэлгүүр, шоурум байхгүй. Барааны хуудсанд өнгө тус бүрийн зураг, материал, хэмжээний хүснэгт бий.',
    sortOrder: 1,
  },
  {
    question: 'Бэлгийн карт байдаг уу?',
    answer: 'Одоогоор бэлгийн карт гаргадаггүй. Бэлэг болгож явуулах бол хүлээн авагчийн хаягаар захиалж, тэмдэглэлд нь бичээрэй.',
    sortOrder: 2,
  },
  {
    question: 'Захиалгаа өөр хүнээр хүлээн авахуулж болох уу?',
    answer: 'Болно. Захиалахдаа хүлээн авагчийн нэр, утсыг хүргэлтийн тэмдэглэлд бичээрэй — хүргэгч тэр хүнтэй холбогдоно.',
    sortOrder: 3,
  },
]

const ID = (n: number) => `00000000-0000-4000-8000-00000000c00${n}`

type SampleMessage = { role: 'customer' | 'assistant' | 'staff'; text: string; minutes: number; intent?: string; events?: string[]; products?: string[] }

const SAMPLES: {
  id: string
  hoursAgo: number
  customerName?: string
  customerPhone?: string
  handover?: { reason: string; status: 'open' | 'resolved'; question: string; products: string[]; purchaseIntent: boolean }
  messages: SampleMessage[]
}[] = [
  {
    id: ID(1),
    hoursAgo: 30,
    messages: [
      { role: 'customer', text: 'Оверсайз hoodie хар өнгөөр M байгаа юу?', minutes: 0 },
      { role: 'assistant', text: 'Тийм, «Оверсайз hoodie» — Хар / M бэлэн байна. Үнэ 219,000₮.\nДэлгэрэнгүй: [Оверсайз hoodie](/products/oversized-hoodie)', minutes: 0, intent: 'product', events: ['variant_check'], products: ['oversized-hoodie'] },
      { role: 'customer', text: 'Сагсанд нэмээд өгөөч', minutes: 1 },
      { role: 'assistant', text: 'Сагсанд нэмлээ: **Оверсайз hoodie — Хар / M** × 1.\nЗахиалахдаа [сагс](/cart) руу орж «Захиалах» дарна уу.', minutes: 1, intent: 'added_to_cart', events: ['purchase_intent', 'added_to_cart'], products: ['oversized-hoodie'] },
    ],
  },
  {
    id: ID(2),
    hoursAgo: 3,
    customerName: 'Сараа (жишээ)',
    customerPhone: '00001234',
    handover: { reason: 'customer_request', status: 'open', question: 'Ажилтантай холбогдмоор байна', products: ['cashmere-crew-sweater'], purchaseIntent: true },
    messages: [
      { role: 'customer', text: 'Ноолууран свитерийг бэлгийн боодолтой явуулж болох уу?', minutes: 0 },
      { role: 'assistant', text: 'Уучлаарай, энэ асуултад дэлгүүрийн сангаас баттай хариулт олдсонгүй — таамаглаж хэлэхгүй.\n[Ноолууран свитер](/products/cashmere-crew-sweater)-ийн үнэ, өнгө, хэмжээ, үлдэгдэл, материалын талаар асууж болно.', minutes: 0, intent: 'fallback', events: ['unanswered'], products: ['cashmere-crew-sweater'] },
      { role: 'customer', text: 'Ажилтантай холбогдмоор байна', minutes: 2 },
      { role: 'assistant', text: 'Ойлголоо — яриаг ажилтанд шилжүүллээ. Ажилтан энэ чатаар хариулна. Нэр, утасны дугаараа үлдээвэл холбогдоход хялбар.', minutes: 2, intent: 'handoff', events: ['handover:customer_request'] },
      { role: 'customer', text: 'Сараа, 0000 1234', minutes: 3 },
    ],
  },
  {
    id: ID(3),
    hoursAgo: 26,
    customerName: 'Тэмүүлэн (жишээ)',
    handover: { reason: 'complaint', status: 'resolved', question: 'Захиалсан цамц маань өөр хэмжээ ирсэн', products: ['oxford-shirt'], purchaseIntent: false },
    messages: [
      { role: 'customer', text: 'Захиалсан цамц маань өөр хэмжээ ирсэн', minutes: 0 },
      { role: 'assistant', text: 'Уучлаарай, ийм зүйл тохиолдсонд харамсаж байна. Асуудлыг ажилтанд шилжүүллээ — захиалгын дугаар (MN-…) болон юу болсныг товч бичээрэй, ажилтан энэ чатаар хариулна.', minutes: 0, intent: 'handoff', events: ['handover:complaint'] },
      { role: 'customer', text: 'Оксфорд цамц M захиалсан, L ирсэн', minutes: 1 },
      { role: 'staff', text: 'Уучлаарай! Солилтыг үнэгүй хийнэ — маргааш M хэмжээг хүргэж, L-ийг буцааж авна. (Жишээ яриа)', minutes: 12 },
      { role: 'customer', text: 'За баярлалаа', minutes: 14 },
    ],
  },
  {
    id: ID(4),
    hoursAgo: 8,
    messages: [
      { role: 'customer', text: 'ene palito hed ve', minutes: 0 },
      { role: 'assistant', text: '«Ноосон пальто» — **459,000₮**.\nӨнгө: Хар, Шаргал хүрэн. [Ноосон пальто](/products/double-faced-wool-coat)', minutes: 0, intent: 'product', events: ['product_answer'], products: ['double-faced-wool-coat'] },
      { role: 'customer', text: 'XL bga yu', minutes: 1 },
      { role: 'assistant', text: '«Ноосон пальто» — XL хэмжээ:\n- Хар: цөөн үлдсэн\n- Шаргал хүрэн: дууссан\nАль өнгийг авах вэ?', minutes: 1, intent: 'product', events: ['variant_check'], products: ['double-faced-wool-coat'] },
    ],
  },
  {
    id: ID(5),
    hoursAgo: 50,
    messages: [
      { role: 'customer', text: 'Танайд даашинз байна уу?', minutes: 0 },
      { role: 'assistant', text: 'Уучлаарай, ийм бараа манай сангаас олдсонгүй.\nМанайд: футболк, цамц, hoodie, свитшот, сүлжмэл, хүрэм, пальто, өмд, жинс, дагалдах хэрэгсэл байна.', minutes: 0, intent: 'fallback', events: ['unanswered', 'not_in_catalogue'] },
    ],
  },
]

export async function seedAssistant(tx: Database, now: Date): Promise<string[]> {
  const log: string[] = []
  const settings = await tx.insert(t.settings).values({ key: 'assistant', value: defaultAssistantSettings() }).onConflictDoNothing().returning({ key: t.settings.key })
  log.push(`assistant settings: +${settings.length}`)

  const existingFaqs = new Set((await tx.select({ q: t.chatFaqs.question }).from(t.chatFaqs)).map((r) => r.q))
  const faqs = SAMPLE_FAQS.filter((f) => !existingFaqs.has(f.question))
  if (faqs.length) await tx.insert(t.chatFaqs).values(faqs.map((f) => ({ ...f, enabled: true })))
  log.push(`assistant faq: +${faqs.length}`)

  const present = new Set((await tx.select({ id: t.chatConversations.id }).from(t.chatConversations).where(inArray(t.chatConversations.id, SAMPLES.map((s) => s.id)))).map((r) => r.id))
  const slugs = [...new Set(SAMPLES.flatMap((s) => [...s.messages.flatMap((m) => m.products ?? []), ...(s.handover?.products ?? [])]))]
  const products = slugs.length ? await tx.select({ id: t.products.id, slug: t.products.slug, name: t.products.name }).from(t.products).where(inArray(t.products.slug, slugs)) : []
  const productId = (slug: string) => products.find((p) => p.slug === slug)?.id
  let added = 0
  for (const sample of SAMPLES) {
    if (present.has(sample.id)) continue
    const start = new Date(now.getTime() - sample.hoursAgo * 3_600_000)
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)
    const lastAt = at(sample.messages[sample.messages.length - 1].minutes)
    const staffAt = sample.messages.filter((m) => m.role === 'staff').map((m) => at(m.minutes)).pop() ?? null
    const open = sample.handover?.status === 'open'
    await tx.insert(t.chatConversations).values({
      id: sample.id,
      channel: 'sample',
      needsHuman: open,
      handoffReason: open ? sample.handover!.reason : null,
      handoffAt: open ? at(sample.messages.find((m) => m.events?.some((e) => e.startsWith('handover')))?.minutes ?? 0) : null,
      lastHumanAt: staffAt,
      botReleasedAt: sample.handover?.status === 'resolved' ? at(sample.messages[sample.messages.length - 1].minutes + 1) : null,
      customerName: sample.customerName ?? null,
      customerPhone: sample.customerPhone ?? null,
      messageCount: sample.messages.length,
      unreadForStaff: open ? 1 : 0,
      lastMessageAt: lastAt,
      isDemo: true,
      createdAt: start,
    })
    await tx.insert(t.chatMessages).values(
      sample.messages.map((m, i) => ({
        conversationId: sample.id,
        role: m.role,
        text: m.text,
        clientMessageId: `sample-${i}`,
        createdAt: at(m.minutes),
        metadata:
          m.role === 'assistant'
            ? { intent: m.intent, mode: 'rules', productIds: (m.products ?? []).map(productId).filter(Boolean), cards: [], actions: [], suggestions: [], events: m.events ?? [], sample: true }
            : m.role === 'staff'
              ? { staffLabel: 'Эзэмшигч (жишээ)' }
              : { script: /[a-z]/i.test(m.text) && !/[Ѐ-ӿ]/.test(m.text) ? 'latin' : 'cyrillic' },
      })),
    )
    if (sample.handover) {
      const h = sample.handover
      await tx.insert(t.chatHandovers).values({
        conversationId: sample.id,
        reason: h.reason,
        status: h.status,
        question: h.question,
        context: {
          products: h.products.map((slug) => ({ slug, name: products.find((p) => p.slug === slug)?.name ?? slug })),
          variant: null,
          purchaseIntent: h.purchaseIntent,
          draftStep: null,
          lastMessages: sample.messages.filter((m) => m.role === 'customer').map((m) => m.text).slice(-4),
        },
        customerName: sample.customerName ?? null,
        customerPhone: sample.customerPhone ?? null,
        resolvedAt: h.status === 'resolved' ? lastAt : null,
        createdAt: start,
      })
    }
    added++
  }
  log.push(`sample conversations: +${added}`)
  return log
}

