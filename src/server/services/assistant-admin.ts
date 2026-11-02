// AI Chatbot administration: taking a chat over, replying as staff, handing it
// back to the assistant, notes, the owner's knowledge (FAQ), chatbot settings
// and the admin's test chat. Permission is checked by the action wrapper; the
// *scope* is checked here: the public demo may only act on chats its own
// browser started, and seeded sample chats are read-only for everyone.
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { assistantSettingsInput } from '@/lib/assistant/settings'
import { actorLabel, audit } from '@/server/audit'
import { ERR, ServiceError, type Actor, type ServiceContext } from '@/server/context'
import * as t from '@/server/db/schema'
import { handleCustomerMessage } from '@/server/assistant/handler'
import { canActOn } from '@/server/queries/assistant-scope'

export { canActOn, conversationScope } from '@/server/queries/assistant-scope'

type Ctx = ServiceContext & { actor: Actor }
type Conversation = typeof t.chatConversations.$inferSelect

const SCOPE_ERROR = () =>
  new ServiceError('demo_scope', 'Демо горимд зөвхөн та өөрөө энэ хөтчөөс эхлүүлсэн яриаг хүлээн авч, хариулна. Жишээ яриа зөвхөн харагдана.')

async function loadForAction(ctx: Ctx, conversationId: string): Promise<Conversation> {
  const id = z.guid().parse(conversationId)
  const [c] = await ctx.db.select().from(t.chatConversations).where(eq(t.chatConversations.id, id)).limit(1)
  if (!c || c.channel === 'test') throw ERR.notFound('Яриа')
  if (c.channel === 'sample') throw new ServiceError('sample', 'Жишээ яриаг зөвхөн харна.')
  if (!canActOn(ctx.actor, c)) throw SCOPE_ERROR()
  return c
}

async function setHandoverStatus(ctx: Ctx, c: Conversation, status: 'taken' | 'resolved') {
  const active = and(eq(t.chatHandovers.conversationId, c.id), ne(t.chatHandovers.status, 'resolved'))
  if (status === 'taken') {
    const updated = await ctx.db.update(t.chatHandovers).set({ status: 'taken', assignedUserId: ctx.actor.userId }).where(active).returning({ id: t.chatHandovers.id })
    // Taken over without the customer asking: record it, so the queue shows who is answering.
    if (!updated.length) {
      await ctx.db
        .insert(t.chatHandovers)
        .values({ conversationId: c.id, reason: 'customer_request', status: 'taken', question: '(Ажилтан өөрөө хүлээн авсан)', assignedUserId: ctx.actor.userId, customerName: c.customerName, customerPhone: c.customerPhone })
        .onConflictDoNothing()
    }
  } else {
    await ctx.db.update(t.chatHandovers).set({ status: 'resolved', resolvedAt: ctx.now, resolvedBy: ctx.actor.userId }).where(active)
  }
}

/** A person takes the chat: the assistant stays silent until it is handed back. */
export async function takeOverConversation(ctx: Ctx, raw: { conversationId: string }) {
  const c = await loadForAction(ctx, raw.conversationId)
  if (c.paused) return { already: true }
  await ctx.db
    .update(t.chatConversations)
    .set({ paused: true, needsHuman: true, takenOverBy: ctx.actor.userId, takenOverAt: ctx.now, handoffAt: c.handoffAt ?? ctx.now, unreadForStaff: 0 })
    .where(eq(t.chatConversations.id, c.id))
  await setHandoverStatus(ctx, c, 'taken')
  await audit(ctx.db, ctx.actor, 'conversation.taken_over', { type: 'conversation', id: c.id }, { reason: c.handoffReason })
  return { already: false }
}

/** Staff hand the chat back: the assistant answers again and the hand-over is resolved. */
export async function releaseConversation(ctx: Ctx, raw: { conversationId: string }) {
  const c = await loadForAction(ctx, raw.conversationId)
  await ctx.db
    .update(t.chatConversations)
    .set({ paused: false, needsHuman: false, botReleasedAt: ctx.now, handoffReason: null, handoffAt: null, takenOverBy: null, unreadForStaff: 0 })
    .where(eq(t.chatConversations.id, c.id))
  await setHandoverStatus(ctx, c, 'resolved')
  // The engine's memory forgets the hand-over, so the next request for a person creates a new one.
  await ctx.db
    .update(t.chatConversations)
    .set({ state: sql`${t.chatConversations.state} - 'handoffReason'` })
    .where(eq(t.chatConversations.id, c.id))
  await audit(ctx.db, ctx.actor, 'conversation.released', { type: 'conversation', id: c.id }, {})
  return { released: true }
}

const replyInput = z.object({
  conversationId: z.guid(),
  text: z.string().trim().min(1, { error: 'Хариултаа бичнэ үү.' }).max(2000, { error: 'Хариулт хэт урт байна.' }),
  clientMessageId: z.string().regex(/^[\w:.-]{8,80}$/),
})

/** A staff reply. Replying takes the chat over (the assistant must not talk over a person). */
export async function staffReply(ctx: Ctx, raw: unknown) {
  const input = replyInput.parse(raw)
  const c = await loadForAction(ctx, input.conversationId)
  if (!c.paused) await takeOverConversation(ctx, { conversationId: c.id })
  const inserted = await ctx.db
    .insert(t.chatMessages)
    .values({ conversationId: c.id, role: 'staff', text: input.text, clientMessageId: `staff:${input.clientMessageId}`, staffUserId: ctx.actor.userId, metadata: { staffLabel: actorLabel(ctx.actor) } })
    .onConflictDoNothing()
    .returning({ id: t.chatMessages.id })
  if (inserted.length) {
    await ctx.db
      .update(t.chatConversations)
      .set({ lastHumanAt: ctx.now, lastMessageAt: ctx.now, unreadForStaff: 0, messageCount: sql`${t.chatConversations.messageCount} + 1` })
      .where(eq(t.chatConversations.id, c.id))
    await audit(ctx.db, ctx.actor, 'conversation.staff_reply', { type: 'conversation', id: c.id }, { length: input.text.length })
  }
  return { sent: inserted.length > 0 }
}

export async function saveConversationNotes(ctx: Ctx, raw: unknown) {
  const input = z.object({ conversationId: z.guid(), notes: z.string().trim().max(4000, { error: 'Тэмдэглэл хэт урт байна.' }) }).parse(raw)
  const c = await loadForAction(ctx, input.conversationId)
  await ctx.db.update(t.chatConversations).set({ notes: input.notes }).where(eq(t.chatConversations.id, c.id))
  await audit(ctx.db, ctx.actor, 'conversation.notes_updated', { type: 'conversation', id: c.id }, { length: input.notes.length })
  return { saved: true }
}

/** Marks a conversation's messages as read by staff (opening it in the admin). */
export async function markConversationRead(ctx: Ctx, conversationId: string) {
  const [c] = await ctx.db.select().from(t.chatConversations).where(eq(t.chatConversations.id, conversationId)).limit(1)
  if (c && canActOn(ctx.actor, c) && c.unreadForStaff > 0) await ctx.db.update(t.chatConversations).set({ unreadForStaff: 0 }).where(eq(t.chatConversations.id, c.id))
}

// ---------------------------------------------------------------------------
// Knowledge and settings (owner / manager)
// ---------------------------------------------------------------------------

const faqInput = z.object({
  id: z.guid().nullish(),
  question: z.string().trim().min(5, { error: 'Асуултаа бичнэ үү.' }).max(300, { error: 'Асуулт хэт урт байна.' }),
  answer: z.string().trim().min(5, { error: 'Хариултаа бичнэ үү.' }).max(1500, { error: 'Хариулт хэт урт байна.' }),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(999).default(0),
})

/**
 * The owner's own answers, quoted verbatim. Prices and stock never belong here:
 * an answer with an amount would go stale unnoticed when a price changes, so it
 * is refused (Lorentz rule) — the assistant reads those from the catalogue.
 */
export async function saveFaq(ctx: Ctx, raw: unknown) {
  if (ctx.actor.role === 'demo') throw ERR.demoReadOnly()
  const input = faqInput.parse(raw)
  if (/\d[\d\s,.]*\s*(?:₮|төгрөг|mnt)/iu.test(input.answer)) {
    throw new ServiceError('amount_in_faq', 'Хариултад үнэ бичихгүй: үнэ, үлдэгдлийг туслах бүтээгдэхүүний сангаас шууд уншина. Үнийг бүтээгдэхүүн дээр өөрчилнө үү.', {
      answer: 'Үнэ, мөнгөн дүн оруулахгүй.',
    })
  }
  const values = { question: input.question, answer: input.answer, enabled: input.enabled, sortOrder: input.sortOrder, updatedBy: ctx.actor.userId }
  let id = input.id ?? null
  if (id) {
    const updated = await ctx.db.update(t.chatFaqs).set(values).where(eq(t.chatFaqs.id, id)).returning({ id: t.chatFaqs.id })
    if (!updated.length) throw ERR.notFound('Асуулт')
  } else {
    ;[{ id }] = await ctx.db.insert(t.chatFaqs).values(values).returning({ id: t.chatFaqs.id })
  }
  await audit(ctx.db, ctx.actor, 'assistant.faq_saved', { type: 'faq', id }, { question: input.question.slice(0, 80), enabled: input.enabled })
  return { id: id! }
}

export async function deleteFaq(ctx: Ctx, raw: { id: string }) {
  if (ctx.actor.role === 'demo') throw ERR.demoReadOnly()
  const id = z.guid().parse(raw.id)
  const deleted = await ctx.db.delete(t.chatFaqs).where(eq(t.chatFaqs.id, id)).returning({ question: t.chatFaqs.question })
  if (!deleted.length) throw ERR.notFound('Асуулт')
  await audit(ctx.db, ctx.actor, 'assistant.faq_deleted', { type: 'faq', id }, { question: deleted[0].question.slice(0, 80) })
  return { deleted: true }
}

export async function saveAssistantSettings(ctx: Ctx, raw: unknown) {
  if (ctx.actor.role === 'demo') throw ERR.demoReadOnly()
  const value = assistantSettingsInput.parse(raw)
  const [before] = await ctx.db.select({ value: t.settings.value }).from(t.settings).where(eq(t.settings.key, 'assistant')).limit(1)
  await ctx.db
    .insert(t.settings)
    .values({ key: 'assistant', value, updatedBy: ctx.actor.userId })
    .onConflictDoUpdate({ target: t.settings.key, set: { value, updatedBy: ctx.actor.userId, updatedAt: ctx.now } })
  const previous = (before?.value ?? {}) as Record<string, unknown>
  const changed = Object.keys(value).filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(value[k as keyof typeof value]))
  await audit(ctx.db, ctx.actor, 'assistant.settings_updated', { type: 'settings', id: 'assistant' }, { changed })
  return value
}

// ---------------------------------------------------------------------------
// "Try the chatbot" (simulated orders, no cart changes, separate usage source)
// ---------------------------------------------------------------------------

export async function sendTestMessage(ctx: Ctx, raw: unknown) {
  return handleCustomerMessage(ctx, raw, { channel: 'test', visitorKey: testVisitorKey(ctx.actor), testUserId: ctx.actor.userId, ipHash: ctx.ipHash ?? `admin:${ctx.actor.userId}` })
}

/** The public demo is one shared user, so its test chats are also keyed by the visitor's browser. */
export const testVisitorKey = (actor: Actor) => (actor.role === 'demo' ? actor.visitorKey : null)

export async function resetTestChats(ctx: Ctx) {
  const key = testVisitorKey(ctx.actor)
  await ctx.db
    .delete(t.chatConversations)
    .where(and(eq(t.chatConversations.channel, 'test'), eq(t.chatConversations.testUserId, ctx.actor.userId), key ? eq(t.chatConversations.visitorId, key) : isNull(t.chatConversations.visitorId)))
  return { reset: true }
}
