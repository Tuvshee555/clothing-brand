// The one customer-message entry point (storefront widget and the admin's
// "try the chatbot"), ported from the Lorentz handler (src/chatbot/handler.ts at
// 69e4110). This file is the persistence around a turn: ownership, a lease per
// conversation, deduplication of retried sends, staff takeover and its
// automatic hand-back, hand-overs, the AI budget and model choice, usage and
// problem logs. The conversation logic itself is runTurn() in turn.ts.
//
// Lorentz lesson: a hand-over never silences the assistant. Only a person
// taking the chat over (paused) or the owner's master switch does.
import { and, desc, eq, gte, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ChatCard, ChatView, PublicChatMessage } from '@/lib/assistant/types'
import { shouldAutoResume, type HandoffReason, type HandoverContext } from '@/lib/chat/handover'
import { parseName } from '@/lib/chat/intents'
import { resolveAiModel, withinBudget } from '@/lib/chat/models'
import { scriptOf } from '@/lib/chat/text'
import { sizeLabel } from '@/lib/catalog'
import { shippingFeeFor } from '@/lib/money'
import { normalizePhone } from '@/lib/phone'
import { ServiceError, type ServiceContext } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { addToCart, getCartCount } from '@/server/services/cart'
import { releaseExpiredChatOrders } from '@/server/services/reservations'
import { placeChatOrder } from './chat-order'
import { aiCostMicroUsd, answerWithLlm } from './llm'
import type { ChatOrderRequest, ChatOrderResult } from './purchase'
import { buildToolContext, cardsFor, type ToolContext } from './tools'
import { runTurn, type ChatState, type OrderStatusView, type TurnOutput } from './turn'

const LEASE_MS = 25_000

export const messageInput = z.object({
  conversationId: z.guid().nullish(),
  clientMessageId: z.string().regex(/^[\w:.-]{8,80}$/),
  text: z.string().trim().min(1, { error: 'Асуултаа бичнэ үү.' }).max(1200, { error: 'Мессеж хэт урт байна.' }),
  pageSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).nullish(),
})

/** Who is talking: a storefront visitor (by hashed cookie), a Messenger/Instagram sender (by hashed id) or an admin's test chat. */
export interface Speaker {
  channel: 'website' | 'test' | 'messenger' | 'instagram'
  visitorKey: string | null
  testUserId?: string | null
  ipHash: string | null
}

type Conversation = typeof t.chatConversations.$inferSelect

export function aiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.ASSISTANT_AI !== 'off'
}

/** Today's estimated AI spend (Ulaanbaatar day), storefront and test chats together. */
export async function spentTodayMicroUsd(db: Database): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${t.aiUsage.costMicroUsd}), 0)::int` })
    .from(t.aiUsage)
    .where(gte(t.aiUsage.createdAt, sql`date_trunc('day', now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar'`))
  return row?.total ?? 0
}

export async function logChatProblem(
  db: Database,
  problem: { conversationId?: string | null; code: string; source: string; level?: 'error' | 'warning'; details?: Record<string, unknown> },
) {
  // Never the customer's text, prompts, tokens or provider bodies: codes and short summaries only.
  console.error(JSON.stringify({ scope: 'assistant', code: problem.code, source: problem.source }))
  await db
    .insert(t.chatErrors)
    .values({ conversationId: problem.conversationId ?? null, code: problem.code, source: problem.source, level: problem.level ?? 'error', details: problem.details ?? {} })
    .catch(() => undefined)
}

function owns(c: Conversation, speaker: Speaker): boolean {
  // The public demo is one shared user: its test chats also belong to the visitor's browser.
  if (speaker.channel === 'test') return c.channel === 'test' && !!speaker.testUserId && c.testUserId === speaker.testUserId && (c.visitorId ?? null) === (speaker.visitorKey ?? null)
  return c.channel === speaker.channel && !!speaker.visitorKey && c.visitorId === speaker.visitorKey
}

export async function findOwnConversation(db: Database, conversationId: string | null | undefined, speaker: Speaker): Promise<Conversation | null> {
  if (!conversationId) return null
  const [c] = await db.select().from(t.chatConversations).where(eq(t.chatConversations.id, conversationId)).limit(1)
  return c && owns(c, speaker) ? c : null
}

async function createConversation(db: Database, speaker: Speaker): Promise<Conversation> {
  const [c] = await db
    .insert(t.chatConversations)
    .values({ channel: speaker.channel, visitorId: speaker.visitorKey, testUserId: speaker.testUserId ?? null, isDemo: true })
    .returning()
  return c
}

// ---------------------------------------------------------------------------
// The view the widget renders
// ---------------------------------------------------------------------------

type Meta = { cards?: ChatCard[]; actions?: PublicChatMessage['actions']; suggestions?: string[]; mode?: 'ai' | 'rules' }

export async function chatView(db: Database, c: Conversation, enabled: boolean, extra: Partial<ChatView> = {}): Promise<ChatView> {
  const rows = await db
    .select()
    .from(t.chatMessages)
    .where(eq(t.chatMessages.conversationId, c.id))
    .orderBy(desc(t.chatMessages.createdAt))
    .limit(60)
  rows.reverse()
  const lastAssistant = [...rows].reverse().find((r) => r.role !== 'customer')?.id
  const messages: PublicChatMessage[] = rows.map((r) => {
    const meta = (r.metadata ?? {}) as Meta
    return {
      id: r.id,
      role: r.role as PublicChatMessage['role'],
      text: r.text,
      createdAt: r.createdAt.toISOString(),
      ...(r.role === 'assistant'
        ? { cards: meta.cards ?? [], actions: meta.actions ?? [], suggestions: r.id === lastAssistant ? (meta.suggestions ?? []) : [], mode: meta.mode }
        : {}),
    }
  })
  return { conversationId: c.id, paused: c.paused, humanActive: c.paused || c.needsHuman, enabled, messages, ...extra }
}

// ---------------------------------------------------------------------------
// Services injected into a turn
// ---------------------------------------------------------------------------

const ORDER_NUMBER = /^MN-\d{5,9}$/

/** Status of one order — only when the phone matches; nothing else about it. */
async function lookupOrder(db: Database, number: string, phone: string): Promise<OrderStatusView | null> {
  const normalized = normalizePhone(phone)
  if (!ORDER_NUMBER.test(number) || !normalized) return null
  const [o] = await db
    .select({ number: t.orders.number, status: t.orders.status, paymentStatus: t.orders.paymentStatus, total: t.orders.total, placedAt: t.orders.placedAt, expiresAt: t.orders.expiresAt, phone: t.orders.customerPhone, source: t.orders.source })
    .from(t.orders)
    .where(eq(t.orders.number, number))
    .limit(1)
  // Sample orders and other visitors' demo orders carry fictional phones; the phone must still match.
  if (!o || o.phone !== normalized) return null
  return { number: o.number, status: o.status, paymentStatus: o.paymentStatus, total: o.total, placedAt: o.placedAt.toISOString(), expiresAt: o.expiresAt?.toISOString() ?? null }
}

async function visitorOrders(db: Database, visitorKey: string | null): Promise<OrderStatusView[]> {
  if (!visitorKey) return []
  const rows = await db
    .select({ number: t.orders.number, status: t.orders.status, paymentStatus: t.orders.paymentStatus, total: t.orders.total, placedAt: t.orders.placedAt, expiresAt: t.orders.expiresAt })
    .from(t.orders)
    .where(eq(t.orders.visitorId, visitorKey))
    .orderBy(desc(t.orders.placedAt))
    .limit(5)
  return rows.map((o) => ({ ...o, placedAt: o.placedAt.toISOString(), expiresAt: o.expiresAt?.toISOString() ?? null }))
}

/** The admin test chat never creates real orders: it gets a simulated, server-priced result. */
function simulatedOrder(tc: ToolContext) {
  return async (request: ChatOrderRequest): Promise<ChatOrderResult> => {
    const variant = tc.catalog.flatMap((p) => p.variants).find((v) => v.id === request.variantId)
    const method = tc.shipping.find((m) => m.code === request.shippingMethod)
    const subtotal = (variant?.price ?? 0) * request.quantity
    const fee = method ? shippingFeeFor(subtotal, method) : 0
    return { number: `TEST-${randomUUID().slice(0, 6).toUpperCase()}`, total: subtotal + fee, subtotal, shippingFee: fee, expiresAt: null, reservationMinutes: tc.settings.reservationMinutes, simulated: true }
  }
}

let lastSweep = 0

/** Releases expired chat-order holds at most once a minute per server instance (the daily cron is the backstop). */
async function sweepExpiredHolds(db: Database, now: Date) {
  if (now.getTime() - lastSweep < 60_000) return
  lastSweep = now.getTime()
  await releaseExpiredChatOrders(db, { now, limit: 20 }).catch((err) => logChatProblem(db, { code: 'EXPIRY_SWEEP_FAILED', source: 'handler', details: { message: String(err).slice(0, 120) } }))
}

export function resetSweepForTests() {
  lastSweep = 0
}

async function handoverContext(db: Database, conversationId: string, tc: ToolContext, state: ChatState): Promise<HandoverContext> {
  const recent = await db
    .select({ role: t.chatMessages.role, text: t.chatMessages.text, metadata: t.chatMessages.metadata })
    .from(t.chatMessages)
    .where(eq(t.chatMessages.conversationId, conversationId))
    .orderBy(desc(t.chatMessages.createdAt))
    .limit(20)
  const ids: string[] = []
  let purchaseIntent = !!state.draft
  for (const m of recent) {
    const meta = (m.metadata ?? {}) as { productIds?: string[]; events?: string[] }
    for (const id of meta.productIds ?? []) if (!ids.includes(id)) ids.push(id)
    if ((meta.events ?? []).some((e) => ['purchase_intent', 'offer', 'added_to_cart', 'chat_order_started', 'chat_order_summary', 'chat_order_created'].includes(e))) purchaseIntent = true
  }
  const products = ids
    .map((id) => tc.catalog.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .slice(0, 5)
    .map((p) => ({ slug: p.slug, name: p.name }))
  const focus = state.focus ? tc.catalog.find((p) => p.id === state.focus!.productId) : null
  return {
    products,
    variant: focus
      ? { product: focus.name, color: focus.colors.find((c) => c.id === state.focus!.colorId)?.name ?? null, size: state.focus!.size ? sizeLabel(state.focus!.size) : null }
      : null,
    purchaseIntent,
    draftStep: state.draft?.step ?? null,
    lastMessages: recent
      .filter((m) => m.role === 'customer')
      .slice(0, 4)
      .map((m) => m.text.slice(0, 160))
      .reverse(),
  }
}

/** One open hand-over per conversation; contact details update it. */
async function saveHandover(db: Database, c: Conversation, reason: HandoffReason, question: string, context: HandoverContext, contact: { name?: string | null; phone?: string | null }, now: Date) {
  const [active] = await db
    .select()
    .from(t.chatHandovers)
    .where(and(eq(t.chatHandovers.conversationId, c.id), ne(t.chatHandovers.status, 'resolved')))
    .limit(1)
  if (active) {
    await db
      .update(t.chatHandovers)
      .set({ context, customerName: contact.name || active.customerName, customerPhone: contact.phone || active.customerPhone })
      .where(eq(t.chatHandovers.id, active.id))
  } else {
    await db
      .insert(t.chatHandovers)
      .values({ conversationId: c.id, reason, question: question.slice(0, 1000), context, customerName: contact.name ?? c.customerName, customerPhone: contact.phone ?? c.customerPhone })
      .onConflictDoNothing()
  }
  await db
    .update(t.chatConversations)
    .set({
      needsHuman: true,
      handoffReason: c.handoffReason ?? reason,
      handoffAt: c.handoffAt ?? now,
      ...(contact.name ? { customerName: contact.name } : {}),
      ...(contact.phone ? { customerPhone: contact.phone } : {}),
    })
    .where(eq(t.chatConversations.id, c.id))
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

export interface HandleResult {
  view: ChatView
  orderNumber?: string
  cartChanged?: boolean
}

export async function handleCustomerMessage(ctx: ServiceContext, raw: unknown, speaker: Speaker): Promise<HandleResult> {
  const input = messageInput.parse(raw)
  const db = ctx.db
  const subject = speaker.ipHash ?? speaker.visitorKey ?? 'anonymous'
  await enforceRateLimit(db, LIMITS.assistantBurst, subject)
  await enforceRateLimit(db, LIMITS.assistantDaily, subject)

  let conversation = (await findOwnConversation(db, input.conversationId, speaker)) ?? (await createConversation(db, speaker))
  const id = conversation.id
  const leaseOwner = randomUUID()
  const leased = await db
    .update(t.chatConversations)
    .set({ leaseOwner, leaseUntil: new Date(ctx.now.getTime() + LEASE_MS) })
    .where(and(eq(t.chatConversations.id, id), or(isNull(t.chatConversations.leaseUntil), lt(t.chatConversations.leaseUntil, ctx.now))))
    .returning({ id: t.chatConversations.id })
  if (!leased.length) throw new ServiceError('busy', 'Өмнөх мессежийг боловсруулж байна. Түр хүлээгээд дахин илгээнэ үү.')

  const started = Date.now()
  try {
    const tc = await buildToolContext(db)
    const settings = tc.settings

    // A retried send (network blip, double click): return what was saved, never answer twice.
    const [duplicate] = await db
      .select()
      .from(t.chatMessages)
      .where(and(eq(t.chatMessages.conversationId, id), eq(t.chatMessages.clientMessageId, input.clientMessageId)))
      .limit(1)
    if (duplicate) {
      if (duplicate.text !== input.text) throw new ServiceError('message_id_reused', 'Мессежийн дугаар давхацлаа. Хуудсаа сэргээнэ үү.')
      const [reply] = await db
        .select({ id: t.chatMessages.id })
        .from(t.chatMessages)
        .where(and(eq(t.chatMessages.conversationId, id), eq(t.chatMessages.clientMessageId, `reply:${input.clientMessageId}`)))
        .limit(1)
      if (reply || conversation.paused || !settings.enabled) return { view: await chatView(db, conversation, settings.enabled) }
      // Otherwise resume a turn that died after saving the message but before the reply.
    } else {
      await db.insert(t.chatMessages).values({
        conversationId: id,
        role: 'customer',
        text: input.text,
        clientMessageId: input.clientMessageId,
        metadata: { script: scriptOf(input.text), pageSlug: input.pageSlug ?? null },
      })
      const waiting = conversation.paused || conversation.needsHuman
      ;[conversation] = await db
        .update(t.chatConversations)
        .set({
          messageCount: sql`${t.chatConversations.messageCount} + 1`,
          ...(waiting ? { unreadForStaff: sql`${t.chatConversations.unreadForStaff} + 1` } : {}),
          lastMessageAt: ctx.now,
        })
        .where(eq(t.chatConversations.id, id))
        .returning()
    }

    // A person took over but has been silent for the owner's limit: the assistant answers again.
    if (conversation.paused && shouldAutoResume({ paused: true, hours: settings.handoverAutoResumeHours, lastHumanAt: conversation.lastHumanAt, takenOverAt: conversation.takenOverAt, now: ctx.now })) {
      ;[conversation] = await db
        .update(t.chatConversations)
        .set({ paused: false, needsHuman: false, botReleasedAt: ctx.now, handoffReason: null, handoffAt: null, takenOverBy: null })
        .where(eq(t.chatConversations.id, id))
        .returning()
      await db
        .update(t.chatHandovers)
        .set({ status: 'resolved', resolvedAt: ctx.now })
        .where(and(eq(t.chatHandovers.conversationId, id), ne(t.chatHandovers.status, 'resolved')))
      await db.insert(t.auditLogs).values({ actorRole: 'system', action: 'conversation.auto_released', entityType: 'conversation', entityId: id, metadata: { hours: settings.handoverAutoResumeHours } })
    }

    // Taken over, or the owner switched the assistant off: the message waits for a person.
    if (conversation.paused || !settings.enabled) return { view: await chatView(db, conversation, settings.enabled) }

    if (speaker.channel === 'website') await sweepExpiredHolds(db, ctx.now)
    const history = (
      await db
        .select({ role: t.chatMessages.role, text: t.chatMessages.text, clientMessageId: t.chatMessages.clientMessageId })
        .from(t.chatMessages)
        .where(eq(t.chatMessages.conversationId, id))
        .orderBy(desc(t.chatMessages.createdAt))
        .limit(13)
    )
      .filter((m) => m.clientMessageId !== input.clientMessageId)
      .slice(0, 12)
      .reverse()
      .map((m) => ({ role: m.role === 'customer' ? ('user' as const) : ('assistant' as const), text: m.text }))

    // The owner's model choice and daily budget: over budget, the assistant answers from its rules.
    const model = resolveAiModel(settings.aiModel)
    const aiOn = aiConfigured() && settings.aiEnabled && withinBudget(await spentTodayMicroUsd(db), settings.aiDailyBudgetUsd)
    const visitorKey = speaker.channel === 'website' ? speaker.visitorKey : null

    let turn: TurnOutput
    try {
      turn = await runTurn({
        text: input.text,
        history,
        state: (conversation.state ?? {}) as ChatState,
        tc,
        pageSlug: input.pageSlug ?? null,
        now: ctx.now.getTime(),
        conversationId: id,
        randomId: () => randomUUID(),
        askAi: aiOn ? ({ memory, history: h }) => answerWithLlm(tc, h, { model, memory, userText: input.text }) : null,
        placeOrder: !settings.chatOrdersEnabled ? null : speaker.channel === 'test' || !visitorKey ? simulatedOrder(tc) : (request) => placeChatOrder(ctx, visitorKey, request, settings),
        addToCart:
          speaker.channel === 'test' || !visitorKey
            ? async () => ({ itemCount: 0, simulated: true })
            : async (variantId, quantity) => {
                await enforceRateLimit(db, LIMITS.cart, subject)
                await addToCart(db, visitorKey, { variantId, quantity }, ctx.now)
                return { itemCount: await getCartCount(db, visitorKey) }
              },
        lookupOrder: (number, phone) => lookupOrder(db, number, phone),
        visitorOrders: () => visitorOrders(db, visitorKey),
      })
    } catch (err) {
      await logChatProblem(db, { conversationId: id, code: 'ENGINE_FAILURE', source: 'runTurn', details: { name: err instanceof Error ? err.name : 'unknown', message: err instanceof Error ? err.message.slice(0, 160) : '' } })
      turn = {
        text: 'Уучлаарай, түр алдаа гарлаа. Дахин асууна уу, эсвэл «ажилтантай холбогдох» гэж бичээрэй.',
        intent: 'error',
        mode: 'rules',
        productIds: [],
        actions: [],
        suggestions: ['Ажилтантай холбогдох'],
        state: (conversation.state ?? {}) as ChatState,
        events: ['engine_error'],
        handoff: null,
        ai: null,
      }
    }

    if (turn.ai) {
      await db.insert(t.aiUsage).values({
        mode: 'llm',
        model: turn.ai.usage.model,
        inputTokens: turn.ai.usage.inputTokens,
        outputTokens: turn.ai.usage.outputTokens,
        costMicroUsd: aiCostMicroUsd(turn.ai.usage),
        toolCalls: turn.ai.usage.toolCalls,
        ok: !!turn.ai.text,
        visitorHash: speaker.ipHash,
        source: speaker.channel === 'test' ? 'test' : 'assistant',
        conversationId: id,
      })
      if (!turn.ai.text) await logChatProblem(db, { conversationId: id, code: 'AI_REPLY_REJECTED', source: 'factCheck', level: 'warning', details: { problems: turn.ai.problems.slice(0, 6), model: turn.ai.usage.model } })
    }
    if (turn.aiError) await logChatProblem(db, { conversationId: id, code: 'AI_CALL_FAILED', source: 'llm', details: { message: turn.aiError.replace(/sk-[\w-]+/g, 'sk-…').slice(0, 160), model } })
    if (turn.orderNumber && speaker.channel === 'website' && turn.events.includes('chat_order_created')) {
      await db.insert(t.auditLogs).values({ actorRole: 'assistant', action: 'order.created_by_assistant', entityType: 'order', entityId: turn.orderNumber, metadata: { conversationId: id } })
    }
    if (turn.events.includes('chat_order_failed') && turn.handoff === 'order_problem') {
      await logChatProblem(db, { conversationId: id, code: 'CHAT_ORDER_FAILED', source: 'placeChatOrder', details: {} })
    }

    const leaseHeld = await db
      .update(t.chatConversations)
      .set({ state: turn.state })
      .where(and(eq(t.chatConversations.id, id), eq(t.chatConversations.leaseOwner, leaseOwner)))
      .returning({ id: t.chatConversations.id })
    if (!leaseHeld.length) throw new ServiceError('busy', 'Өмнөх мессежийг боловсруулж байна. Түр хүлээгээд дахин илгээнэ үү.')

    // A hand-over (or contact details left while waiting for a person).
    const phone = normalizePhone(input.text.match(/(?:\+?976[\s-]?)?\d[\d\s-]{6,12}\d/)?.[0] ?? '')
    const reason = turn.handoff ?? (conversation.needsHuman && phone ? ((conversation.handoffReason as HandoffReason | null) ?? 'customer_request') : null)
    if (reason) {
      const context = await handoverContext(db, id, tc, turn.state)
      const name = phone ? parseName(input.text) : ''
      await saveHandover(db, conversation, reason, input.text, context, { phone, name: name.length >= 2 ? name : null }, ctx.now)
    }

    // A person may have taken over during the model's wait: then the reply is not published.
    const [current] = await db.select().from(t.chatConversations).where(eq(t.chatConversations.id, id)).limit(1)
    if (current.paused) return { view: await chatView(db, current, settings.enabled) }

    const slugs = turn.productIds.map((pid) => tc.catalog.find((p) => p.id === pid)?.slug).filter((s): s is string => !!s)
    await db.insert(t.chatMessages).values({
      conversationId: id,
      role: 'assistant',
      text: turn.text,
      clientMessageId: `reply:${input.clientMessageId}`,
      metadata: {
        intent: turn.intent,
        mode: turn.mode,
        model: turn.mode === 'ai' ? model : null,
        productIds: turn.productIds,
        cards: cardsFor(tc, slugs),
        actions: turn.actions,
        suggestions: turn.suggestions,
        events: turn.events,
        handoff: turn.handoff,
        orderNumber: turn.orderNumber ?? null,
        durationMs: Date.now() - started,
      },
    })
    const [updated] = await db
      .update(t.chatConversations)
      .set({ messageCount: sql`${t.chatConversations.messageCount} + 1`, lastMessageAt: new Date() })
      .where(eq(t.chatConversations.id, id))
      .returning()
    return { view: await chatView(db, updated, settings.enabled, { cartChanged: turn.cartChanged }), orderNumber: turn.orderNumber, cartChanged: turn.cartChanged }
  } finally {
    await db.update(t.chatConversations).set({ leaseOwner: null, leaseUntil: null }).where(and(eq(t.chatConversations.id, id), eq(t.chatConversations.leaseOwner, leaseOwner)))
  }
}

/** The widget's check for staff replies while a person is involved. */
export async function pollConversation(db: Database, conversationId: string, speaker: Speaker): Promise<ChatView | null> {
  const c = await findOwnConversation(db, conversationId, speaker)
  if (!c) return null
  const [setting] = await db.select({ value: t.settings.value }).from(t.settings).where(eq(t.settings.key, 'assistant')).limit(1)
  const enabled = (setting?.value as { enabled?: boolean } | undefined)?.enabled !== false
  return chatView(db, c, enabled)
}

