// MANAN's side of the Meta integration: a Messenger or Instagram message goes
// through the same assistant, catalogue tools, budget, rate limits and
// takeover rules as the storefront chat. Differences, all deliberate:
// - the conversation is keyed by a hash of (platform, account, sender) — the
//   raw Meta id is never stored on the conversation;
// - there is no storefront cart or visitor cookie, so a chat order or "add to
//   cart" from Messenger is simulated (no stock is reserved, no order created);
// - product cards become short text lines with a link to the store.
import 'server-only'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { ChatCard } from '@/lib/assistant/types'
import { formatMoney } from '@/lib/money'
import { handleCustomerMessage } from '@/server/assistant/handler'
import { appUrl } from '@/server/app-url'
import { ServiceError } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { sha256Hex } from '@/server/security/crypto'
import type { MetaPlatform } from './events'
import type { MetaAdapter } from './process'

export const metaVisitorKey = (platform: MetaPlatform, accountId: string, senderId: string) => `meta:${sha256Hex(`${platform}:${accountId}:${senderId}`)}`
const engineMessageId = (mid: string) => `meta:${sha256Hex(mid).slice(0, 40)}`

async function conversationFor(db: Database, platform: MetaPlatform, visitorKey: string) {
  const [c] = await db
    .select()
    .from(t.chatConversations)
    .where(and(eq(t.chatConversations.channel, platform), eq(t.chatConversations.visitorId, visitorKey)))
    .orderBy(desc(t.chatConversations.lastMessageAt))
    .limit(1)
  return c ?? null
}

function withCards(text: string, cards: ChatCard[]): string {
  if (!cards.length) return text
  const lines = cards.slice(0, 3).map((c) => `• ${c.name} — ${formatMoney(c.price)}: ${appUrl(c.url)}`)
  return `${text}\n\n${lines.join('\n')}`
}

export const mananMetaAdapter: MetaAdapter = {
  async answer(db, input) {
    const visitorKey = metaVisitorKey(input.platform, input.accountId, input.senderId)
    const clientMessageId = engineMessageId(input.messageId)
    for (let attempt = 0; ; attempt++) {
      try {
        const existing = await conversationFor(db, input.platform, visitorKey)
        const { view } = await handleCustomerMessage(
          { db, actor: null, now: new Date(), ipHash: null },
          { conversationId: existing?.id ?? null, clientMessageId, text: input.text },
          { channel: input.platform, visitorKey, ipHash: null },
        )
        const [reply] = await db
          .select({ text: t.chatMessages.text, metadata: t.chatMessages.metadata })
          .from(t.chatMessages)
          .where(and(eq(t.chatMessages.conversationId, view.conversationId), eq(t.chatMessages.clientMessageId, `reply:${clientMessageId}`)))
          .limit(1)
        if (!reply) return null // taken over or switched off: the message waits for a person
        const meta = (reply.metadata ?? {}) as { cards?: ChatCard[]; suggestions?: string[] }
        return { text: withCards(reply.text, meta.cards ?? []), suggestions: meta.suggestions ?? [] }
      } catch (err) {
        // Two messages sent in a row: the first turn holds the conversation for a moment.
        if (err instanceof ServiceError && err.code === 'busy' && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2_000))
          continue
        }
        if (err instanceof ServiceError && err.code === 'rate_limited') return null
        throw err
      }
    }
  },

  async staffReplied(db, input) {
    const c = await conversationFor(db, input.platform, metaVisitorKey(input.platform, input.accountId, input.customerId))
    if (!c) return
    const inserted = await db
      .insert(t.chatMessages)
      .values({ conversationId: c.id, role: 'staff', text: input.text || '(Ажилтан Meta-ийн inbox-оос хариулсан)', clientMessageId: `staff:${engineMessageId(input.messageId)}`, metadata: { staffLabel: 'Meta inbox' } })
      .onConflictDoNothing()
      .returning({ id: t.chatMessages.id })
    // A person is answering: the assistant stays silent until it is handed back (or the owner's auto-resume time passes).
    await db
      .update(t.chatConversations)
      .set({
        paused: true,
        needsHuman: true,
        takenOverAt: c.takenOverAt ?? input.at,
        lastHumanAt: input.at,
        unreadForStaff: 0,
        ...(inserted.length ? { messageCount: sql`${t.chatConversations.messageCount} + 1`, lastMessageAt: input.at } : {}),
      })
      .where(eq(t.chatConversations.id, c.id))
  },

  commentReply:
    'Сайн байна уу! Сэтгэгдэл бичсэнд баярлалаа. Үнэ, хэмжээ, үлдэгдлийн талаар энд, Messenger-ээр асуугаарай — шууд хариулъя. (MANAN бол Ursgal Digital-ын портфолио демо дэлгүүр.)',
  attachmentReply: 'Зургийг тань хүлээн авлаа. Би бичвэрт хариулдаг тул ямар бараа, ямар хэмжээ сонирхож байгаагаа бичээрэй. Ажилтантай ярих бол «ажилтан» гэж бичнэ үү.',
}
