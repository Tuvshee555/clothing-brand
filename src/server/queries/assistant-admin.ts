// Read models for the AI Chatbot admin section. Every query that returns chats
// is scoped by the actor (conversationScope): the public demo sees the sample
// chats and its own browser's, never another visitor's.
import 'server-only'
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { parseAssistantSettings } from '@/lib/assistant/settings'
import { summarizeReplies } from '@/lib/chat/analytics'
import type { HandoverContext } from '@/lib/chat/handover'
import { DEFAULT_AI_MODEL, resolveAiModel } from '@/lib/chat/models'
import type { Actor } from '@/server/context'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { aiConfigured, spentTodayMicroUsd } from '@/server/assistant/handler'
import { loadCatalog } from './catalog'
import { canActOn, conversationScope } from './assistant-scope'
import { loadPolicies, loadShippingMethods } from './settings'

const since = (days: number) => sql`now() - make_interval(days => ${days})`
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function getAssistantSettings() {
  const [row] = await db.select({ value: t.settings.value, updatedAt: t.settings.updatedAt }).from(t.settings).where(eq(t.settings.key, 'assistant')).limit(1)
  return { settings: parseAssistantSettings(row?.value), updatedAt: row?.updatedAt ?? null }
}

/** What the assistant runs on right now (no secrets: only whether a key exists). */
export async function getAssistantStatus() {
  const { settings } = await getAssistantSettings()
  const spent = await spentTodayMicroUsd(db)
  const configured = aiConfigured()
  const model = resolveAiModel(settings.aiModel)
  const budgetMicro = Math.round(settings.aiDailyBudgetUsd * 1_000_000)
  const aiActive = configured && settings.aiEnabled && settings.aiDailyBudgetUsd > 0 && spent < budgetMicro
  return {
    settings,
    configured,
    model,
    defaultModel: DEFAULT_AI_MODEL,
    spentTodayUsd: spent / 1_000_000,
    budgetUsd: settings.aiDailyBudgetUsd,
    mode: !settings.enabled ? ('off' as const) : aiActive ? ('ai' as const) : ('rules' as const),
    reason: !settings.enabled
      ? 'Туслахыг унтраасан.'
      : !configured
        ? 'Каталогийн горим: үнэ, үлдэгдэл, хүргэлтийн хариулт бүрийг дэлгүүрийн сангаас шууд уншина. AI холболтыг Ursgal Digital асаана.'
        : !settings.aiEnabled
          ? 'Эзэмшигч AI-г унтраасан: каталогийн горим.'
          : spent >= budgetMicro || settings.aiDailyBudgetUsd <= 0
            ? 'Өнөөдрийн AI төсөв дууссан: маргааш хүртэл каталогийн горим.'
            : 'AI горим идэвхтэй (баримт шалгалттай).',
  }
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getAssistantOverview(actor: Actor) {
  const scope = conversationScope(actor)
  const [status, [convs], handovers, recentProblems] = await Promise.all([
    getAssistantStatus(),
    db
      .select({
        week: sql<number>`count(*) filter (where ${t.chatConversations.lastMessageAt} >= ${since(7)})::int`,
        today: sql<number>`count(*) filter (where ${t.chatConversations.lastMessageAt} >= date_trunc('day', now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar')::int`,
        waiting: sql<number>`count(*) filter (where ${t.chatConversations.needsHuman} and not ${t.chatConversations.paused})::int`,
        taken: sql<number>`count(*) filter (where ${t.chatConversations.paused})::int`,
      })
      .from(t.chatConversations)
      .where(scope),
    listHandovers(actor, { status: 'active', limit: 5 }),
    listProblems(actor, { days: 7, limit: 5 }),
  ])
  const replies = await db
    .select({ createdAt: t.chatMessages.createdAt, metadata: t.chatMessages.metadata })
    .from(t.chatMessages)
    .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatMessages.conversationId))
    .where(and(scope, eq(t.chatMessages.role, 'assistant'), gte(t.chatMessages.createdAt, since(7))))
  const summary = summarizeReplies(replies)
  return { status, conversations: convs, handovers, recentProblems, summary }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type ConversationFilter = 'all' | 'attention' | 'taken' | 'orders' | 'samples'

export async function listConversations(actor: Actor, f: { filter?: ConversationFilter; q?: string; page?: number }) {
  const page = Math.max(1, Math.min(500, f.page ?? 1))
  const filters: (SQL | undefined)[] = [conversationScope(actor)]
  if (f.filter === 'attention') filters.push(or(eq(t.chatConversations.needsHuman, true), sql`${t.chatConversations.unreadForStaff} > 0`))
  if (f.filter === 'taken') filters.push(eq(t.chatConversations.paused, true))
  if (f.filter === 'samples') filters.push(eq(t.chatConversations.channel, 'sample'))
  if (f.filter === 'orders') filters.push(sql`exists (select 1 from store.orders o where o.conversation_id = ${t.chatConversations.id})`)
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`
    filters.push(
      or(
        ilike(t.chatConversations.customerName, like),
        ilike(t.chatConversations.customerPhone, `%${escapeLike(f.q.replace(/\D/g, '') || f.q)}%`),
        sql`exists (select 1 from store.chat_messages m where m.conversation_id = ${t.chatConversations.id} and m.text ilike ${like})`,
      ),
    )
  }
  const where = and(...filters)
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: t.chatConversations.id,
        channel: t.chatConversations.channel,
        visitorId: t.chatConversations.visitorId,
        paused: t.chatConversations.paused,
        needsHuman: t.chatConversations.needsHuman,
        handoffReason: t.chatConversations.handoffReason,
        customerName: t.chatConversations.customerName,
        customerPhone: t.chatConversations.customerPhone,
        messageCount: t.chatConversations.messageCount,
        unreadForStaff: t.chatConversations.unreadForStaff,
        lastMessageAt: t.chatConversations.lastMessageAt,
        createdAt: t.chatConversations.createdAt,
        lastText: sql<string | null>`(select m.text from store.chat_messages m where m.conversation_id = ${t.chatConversations.id} order by m.created_at desc limit 1)`,
        lastRole: sql<string | null>`(select m.role from store.chat_messages m where m.conversation_id = ${t.chatConversations.id} order by m.created_at desc limit 1)`,
        orders: sql<number>`(select count(*) from store.orders o where o.conversation_id = ${t.chatConversations.id})::int`,
      })
      .from(t.chatConversations)
      .where(where)
      .orderBy(desc(t.chatConversations.lastMessageAt))
      .limit(30)
      .offset((page - 1) * 30),
    db.select({ n: count() }).from(t.chatConversations).where(where),
  ])
  return { rows: rows.map((r) => ({ ...r, mine: actor.role === 'demo' && r.channel === 'website' })), total: n, page, pages: Math.max(1, Math.ceil(n / 30)) }
}

export async function getConversationDetail(actor: Actor, id: string) {
  const [c] = await db
    .select()
    .from(t.chatConversations)
    .where(and(eq(t.chatConversations.id, id), conversationScope(actor)))
    .limit(1)
  if (!c) return null
  const [messages, handovers, linkedOrders, catalog, staff] = await Promise.all([
    db.select().from(t.chatMessages).where(eq(t.chatMessages.conversationId, id)).orderBy(asc(t.chatMessages.createdAt)).limit(300),
    db.select().from(t.chatHandovers).where(eq(t.chatHandovers.conversationId, id)).orderBy(desc(t.chatHandovers.createdAt)),
    db
      .select({ id: t.orders.id, number: t.orders.number, status: t.orders.status, paymentStatus: t.orders.paymentStatus, total: t.orders.total, placedAt: t.orders.placedAt, source: t.orders.source })
      .from(t.orders)
      .where(c.channel === 'website' && c.visitorId ? or(eq(t.orders.conversationId, id), eq(t.orders.visitorId, c.visitorId)) : eq(t.orders.conversationId, id))
      .orderBy(desc(t.orders.placedAt))
      .limit(10),
    loadCatalog(db),
    c.takenOverBy ? db.select({ name: t.users.name, role: t.users.role }).from(t.users).where(eq(t.users.id, c.takenOverBy)).limit(1) : Promise.resolve([]),
  ])
  // What the chat established: products discussed, the chosen variant, purchase intent.
  const productIds: string[] = []
  let purchaseIntent = false
  for (const m of messages) {
    const meta = (m.metadata ?? {}) as { productIds?: string[]; events?: string[] }
    for (const pid of meta.productIds ?? []) if (!productIds.includes(pid)) productIds.push(pid)
    if ((meta.events ?? []).some((e) => ['purchase_intent', 'offer', 'added_to_cart', 'chat_order_started', 'chat_order_summary', 'chat_order_created'].includes(e))) purchaseIntent = true
  }
  const state = (c.state ?? {}) as { focus?: { productId: string; colorId?: string | null; size?: string | null }; draft?: { step: string; quantity: number } | null }
  const focus = state.focus ? catalog.find((p) => p.id === state.focus!.productId) : null
  return {
    conversation: c,
    canAct: canActOn(actor, c),
    takenOverByName: staff[0]?.name ?? null,
    messages,
    handovers: handovers.map((h) => ({ ...h, context: h.context as Partial<HandoverContext> })),
    orders: linkedOrders,
    products: productIds
      .map((pid) => catalog.find((p) => p.id === pid))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
    variant: focus ? { product: focus.name, slug: focus.slug, color: focus.colors.find((x) => x.id === state.focus!.colorId)?.name ?? null, size: state.focus!.size ?? null } : null,
    draft: state.draft ?? null,
    purchaseIntent,
  }
}

// ---------------------------------------------------------------------------
// Hand-overs and inquiries
// ---------------------------------------------------------------------------

export async function listHandovers(actor: Actor, f: { status?: 'active' | 'open' | 'taken' | 'resolved' | 'all'; limit?: number }) {
  const status = f.status ?? 'active'
  const statusFilter =
    status === 'active' ? ne(t.chatHandovers.status, 'resolved') : status === 'all' ? undefined : eq(t.chatHandovers.status, status)
  const rows = await db
    .select({
      id: t.chatHandovers.id,
      conversationId: t.chatHandovers.conversationId,
      reason: t.chatHandovers.reason,
      status: t.chatHandovers.status,
      question: t.chatHandovers.question,
      context: t.chatHandovers.context,
      customerName: t.chatHandovers.customerName,
      customerPhone: t.chatHandovers.customerPhone,
      createdAt: t.chatHandovers.createdAt,
      resolvedAt: t.chatHandovers.resolvedAt,
      assignedName: t.users.name,
      channel: t.chatConversations.channel,
      visitorId: t.chatConversations.visitorId,
      paused: t.chatConversations.paused,
      unread: t.chatConversations.unreadForStaff,
    })
    .from(t.chatHandovers)
    .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatHandovers.conversationId))
    .leftJoin(t.users, eq(t.users.id, t.chatHandovers.assignedUserId))
    .where(and(conversationScope(actor), statusFilter))
    .orderBy(desc(t.chatHandovers.createdAt))
    .limit(f.limit ?? 100)
  return rows.map((r) => ({ ...r, context: r.context as Partial<HandoverContext>, canAct: canActOn(actor, r) }))
}

export async function countOpenHandovers(actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(t.chatHandovers)
    .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatHandovers.conversationId))
    .where(and(conversationScope(actor), eq(t.chatHandovers.status, 'open')))
  return row?.n ?? 0
}

export type InquiryKind = 'unanswered' | 'not_in_catalogue' | 'variant_unavailable'

/**
 * What customers asked that the store could not answer from its data, what they
 * looked for that the catalogue lacks, and the sold-out variants they wanted —
 * the owner's to-do list for knowledge, assortment and restocking.
 */
export async function listInquiries(actor: Actor, f: { days?: number; kind?: InquiryKind | 'all' }) {
  const days = Math.min(Math.max(f.days ?? 30, 1), 90)
  const kinds: InquiryKind[] = f.kind && f.kind !== 'all' ? [f.kind] : ['unanswered', 'not_in_catalogue', 'variant_unavailable']
  const replies = await db
    .select({
      id: t.chatMessages.id,
      conversationId: t.chatMessages.conversationId,
      createdAt: t.chatMessages.createdAt,
      metadata: t.chatMessages.metadata,
      channel: t.chatConversations.channel,
      // The customer message this reply answered: the latest one before it.
      question: sql<string | null>`(select c.text from store.chat_messages c where c.conversation_id = ${t.chatMessages.conversationId} and c.role = 'customer' and c.created_at <= ${t.chatMessages.createdAt} order by c.created_at desc limit 1)`,
    })
    .from(t.chatMessages)
    .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatMessages.conversationId))
    .where(
      and(
        conversationScope(actor),
        eq(t.chatMessages.role, 'assistant'),
        gte(t.chatMessages.createdAt, since(days)),
        sql`${t.chatMessages.metadata}->'events' ?| array[${sql.join(kinds.map((k) => sql`${k}`), sql`, `)}]`,
      ),
    )
    .orderBy(desc(t.chatMessages.createdAt))
    .limit(200)
  const catalog = await loadCatalog(db)
  return replies.map((r) => {
    const meta = (r.metadata ?? {}) as { events?: string[]; productIds?: string[] }
    const events = meta.events ?? []
    const kind: InquiryKind = events.includes('not_in_catalogue') ? 'not_in_catalogue' : events.includes('variant_unavailable') ? 'variant_unavailable' : 'unanswered'
    return {
      id: r.id,
      conversationId: r.conversationId,
      sample: r.channel === 'sample',
      createdAt: r.createdAt,
      kind,
      question: r.question ?? '',
      products: (meta.productIds ?? []).map((pid) => catalog.find((p) => p.id === pid)?.name).filter((n): n is string => !!n),
    }
  })
}

// ---------------------------------------------------------------------------
// Knowledge (what the assistant reads)
// ---------------------------------------------------------------------------

/** Rows across every chart a stored size guide holds: clothing (tops, bottoms) and shoes (adult, children's). */
function sizeGuideRows(value: unknown): number {
  const guide = value as Partial<Record<'tops' | 'bottoms' | 'shoes' | 'kids', { rows?: unknown[] }>> | null
  return (['tops', 'bottoms', 'shoes', 'kids'] as const).reduce((n, key) => n + (guide?.[key]?.rows?.length ?? 0), 0)
}

export async function getKnowledge() {
  const [catalog, policies, shipping, faqs, sizeGuide, details] = await Promise.all([
    loadCatalog(db),
    loadPolicies(db),
    loadShippingMethods(db, { activeOnly: false }),
    db.select().from(t.chatFaqs).orderBy(asc(t.chatFaqs.sortOrder), asc(t.chatFaqs.createdAt)),
    db.select({ value: t.settings.value, updatedAt: t.settings.updatedAt }).from(t.settings).where(eq(t.settings.key, 'size_guide')).limit(1),
    db.select({ id: t.products.id, care: t.products.care, description: t.products.description }).from(t.products).where(eq(t.products.status, 'active')),
  ])
  const variants = catalog.flatMap((p) => p.variants.filter((v) => v.isActive))
  const missing = catalog
    .map((p) => {
      const d = details.find((x) => x.id === p.id)
      const gaps = [!p.fit && 'хэлбэр', !d?.care && 'арчилгаа', !p.material && 'материал', p.images.length === 0 && 'зураг'].filter((g): g is string => !!g)
      return { id: p.id, name: p.name, gaps }
    })
    .filter((p) => p.gaps.length > 0)
  return {
    products: {
      count: catalog.length,
      variants: variants.length,
      units: variants.reduce((n, v) => n + v.stock, 0),
      soldOutVariants: variants.filter((v) => v.stock <= 0).length,
      colors: catalog.reduce((n, p) => n + p.colors.length, 0),
      missing,
    },
    policies: Object.entries(policies).map(([key, p]) => ({ key, title: p.title, paragraphs: p.body.split(/\n\n+/).length })),
    shipping,
    sizeGuide: sizeGuide[0] ? { rows: sizeGuideRows(sizeGuide[0].value) } : null,
    faqs,
  }
}

// ---------------------------------------------------------------------------
// Analytics and usage
// ---------------------------------------------------------------------------

export async function getAnalytics(actor: Actor, days: number) {
  const scope = conversationScope(actor)
  const [replies, customers, handovers, conversations] = await Promise.all([
    db
      .select({ createdAt: t.chatMessages.createdAt, metadata: t.chatMessages.metadata })
      .from(t.chatMessages)
      .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatMessages.conversationId))
      .where(and(scope, eq(t.chatMessages.role, 'assistant'), gte(t.chatMessages.createdAt, since(days)))),
    db
      .select({ metadata: t.chatMessages.metadata })
      .from(t.chatMessages)
      .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatMessages.conversationId))
      .where(and(scope, eq(t.chatMessages.role, 'customer'), gte(t.chatMessages.createdAt, since(days)))),
    db
      .select({ reason: t.chatHandovers.reason, n: count() })
      .from(t.chatHandovers)
      .innerJoin(t.chatConversations, eq(t.chatConversations.id, t.chatHandovers.conversationId))
      .where(and(scope, gte(t.chatHandovers.createdAt, since(days))))
      .groupBy(t.chatHandovers.reason),
    db
      .select({
        day: sql<string>`to_char((${t.chatConversations.createdAt} at time zone 'Asia/Ulaanbaatar')::date, 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(t.chatConversations)
      .where(and(scope, gte(t.chatConversations.createdAt, since(days))))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ])
  const summary = summarizeReplies(replies, customers)
  const catalog = await loadCatalog(db)
  const topProducts = Object.entries(summary.products)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, n]) => ({ name: catalog.find((p) => p.id === id)?.name ?? '—', slug: catalog.find((p) => p.id === id)?.slug ?? '', n }))
  return { summary, handovers, conversations, topProducts, customerMessages: customers.length }
}

export async function getUsage(days: number) {
  const status = await getAssistantStatus()
  const rows = await db
    .select({
      day: sql<string>`to_char((${t.aiUsage.createdAt} at time zone 'Asia/Ulaanbaatar')::date, 'YYYY-MM-DD')`,
      model: t.aiUsage.model,
      source: t.aiUsage.source,
      calls: count(),
      ok: sql<number>`count(*) filter (where ${t.aiUsage.ok})::int`,
      inputTokens: sql<number>`coalesce(sum(${t.aiUsage.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${t.aiUsage.outputTokens}), 0)::int`,
      costMicroUsd: sql<number>`coalesce(sum(${t.aiUsage.costMicroUsd}), 0)::int`,
    })
    .from(t.aiUsage)
    .where(and(eq(t.aiUsage.mode, 'llm'), isNotNull(t.aiUsage.model), gte(t.aiUsage.createdAt, since(days))))
    .groupBy(sql`1`, t.aiUsage.model, t.aiUsage.source)
    .orderBy(desc(sql`1`))
  const [replies] = await db
    .select({
      total: count(),
      ai: sql<number>`count(*) filter (where ${t.chatMessages.metadata}->>'mode' = 'ai')::int`,
    })
    .from(t.chatMessages)
    .where(and(eq(t.chatMessages.role, 'assistant'), gte(t.chatMessages.createdAt, since(days))))
  return { status, rows, replies }
}

// ---------------------------------------------------------------------------
// Activity history and problems
// ---------------------------------------------------------------------------

const CHAT_ACTIONS = [
  'assistant.settings_updated',
  'assistant.faq_saved',
  'assistant.faq_deleted',
  'conversation.taken_over',
  'conversation.released',
  'conversation.staff_reply',
  'conversation.notes_updated',
  'conversation.auto_released',
  'order.created_by_assistant',
]

export async function listActivity(actor: Actor, limit = 100) {
  const rows = await db
    .select({
      id: t.auditLogs.id,
      action: t.auditLogs.action,
      actorRole: t.auditLogs.actorRole,
      actorName: t.users.name,
      entityType: t.auditLogs.entityType,
      entityId: t.auditLogs.entityId,
      metadata: t.auditLogs.metadata,
      createdAt: t.auditLogs.createdAt,
    })
    .from(t.auditLogs)
    .leftJoin(t.users, eq(t.users.id, t.auditLogs.actorUserId))
    .where(inArray(t.auditLogs.action, CHAT_ACTIONS))
    .orderBy(desc(t.auditLogs.createdAt))
    .limit(limit * 2)
  if (actor.role !== 'demo') return rows.slice(0, limit)
  // The demo sees settings/knowledge changes and what happened to its own chats.
  const visible = new Set(
    (await db.select({ id: t.chatConversations.id }).from(t.chatConversations).where(conversationScope(actor))).map((c) => c.id),
  )
  return rows
    .filter((r) => r.entityType === 'settings' || r.entityType === 'faq' || (r.entityType === 'conversation' && r.entityId && visible.has(r.entityId)) || (r.entityType === 'order' && visible.has(String((r.metadata as { conversationId?: string }).conversationId ?? ''))))
    .slice(0, limit)
}

export async function listProblems(actor: Actor, f: { days?: number; limit?: number }) {
  const rows = await db
    .select()
    .from(t.chatErrors)
    .where(gte(t.chatErrors.createdAt, since(Math.min(Math.max(f.days ?? 30, 1), 90))))
    .orderBy(desc(t.chatErrors.createdAt))
    .limit(f.limit ?? 100)
  if (actor.role !== 'demo') return rows.map((r) => ({ ...r, linkable: !!r.conversationId }))
  const ids = rows.map((r) => r.conversationId).filter((x): x is string => !!x)
  const visible = new Set(
    ids.length ? (await db.select({ id: t.chatConversations.id }).from(t.chatConversations).where(and(inArray(t.chatConversations.id, ids), conversationScope(actor)))).map((c) => c.id) : [],
  )
  return rows.map((r) => ({ ...r, linkable: !!r.conversationId && visible.has(r.conversationId) }))
}

/** The admin's own latest test chat (for the demo: this browser's). */
export async function latestTestConversation(actor: Actor) {
  const key = actor.role === 'demo' ? actor.visitorKey : null
  const [c] = await db
    .select()
    .from(t.chatConversations)
    .where(and(eq(t.chatConversations.channel, 'test'), eq(t.chatConversations.testUserId, actor.userId), key ? eq(t.chatConversations.visitorId, key) : isNull(t.chatConversations.visitorId)))
    .orderBy(desc(t.chatConversations.lastMessageAt))
    .limit(1)
  return c ?? null
}
