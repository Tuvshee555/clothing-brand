// Human hand-over and the AI Chatbot admin's permissions: a request for a
// person flags the chat with its context; a takeover pauses the assistant;
// staff replies reach the customer; handing back resumes it. The public demo
// may only act on chats its own browser started, never on settings or knowledge.
import { and, desc, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasPermission } from '@/lib/roles'
import * as t from '@/server/db/schema'
import { pollConversation } from '@/server/assistant/handler'
import {
  conversationScope,
  releaseConversation,
  saveAssistantSettings,
  saveFaq,
  sendTestMessage,
  staffReply,
  takeOverConversation,
} from '@/server/services/assistant-admin'
import { defaultAssistantSettings } from '@/lib/assistant/settings'
import { ctx, createTestDb, demoActor, ownerActor, visitor, type TestDb } from './helpers'
import { startChat } from './chat-helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  delete process.env.OPENAI_API_KEY
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

const handoverOf = async (conversationId: string) =>
  (await db.select().from(t.chatHandovers).where(eq(t.chatHandovers.conversationId, conversationId)).orderBy(desc(t.chatHandovers.createdAt)))[0]
const conversation = async (id: string) => (await db.select().from(t.chatConversations).where(eq(t.chatConversations.id, id)))[0]
const owner = async () => ({ ...ctx(db), actor: await ownerActor(db) })

describe('human hand-over', () => {
  it('a request for a person opens a hand-over with what the chat established', async () => {
    const chat = startChat(db)
    await chat.say('Хар hoodie L байгаа юу?')
    await chat.say('авъя')
    const r = await chat.say('hun bn uu? huntei yarimaar bn')
    expect(r?.text).toMatch(/ажилтанд шилжүүллээ/)
    const c = await conversation(chat.conversationId!)
    expect(c).toMatchObject({ needsHuman: true, paused: false, handoffReason: 'customer_request' })
    const h = await handoverOf(c.id)
    expect(h).toMatchObject({ reason: 'customer_request', status: 'open' })
    const context = h.context as { products: { slug: string }[]; variant: { color: string; size: string }; purchaseIntent: boolean; lastMessages: string[] }
    expect(context.products.map((p) => p.slug)).toContain('oversized-hoodie')
    expect(context.variant).toMatchObject({ color: 'Хар', size: 'L' })
    expect(context.purchaseIntent).toBe(true)
    expect(context.lastMessages.length).toBeGreaterThan(0)

    // The assistant keeps answering while the customer waits; contact details reach the hand-over.
    expect((await chat.say('Хүргэлт хэд хоног вэ?'))?.text).toContain('Ажлын 1–2 өдөр')
    expect((await chat.say('Бат 9911 2233'))?.text).toMatch(/ажилтанд дамжууллаа/)
    expect(await handoverOf(c.id)).toMatchObject({ customerPhone: '99112233', customerName: 'Бат' })
    expect((await db.select().from(t.chatHandovers).where(eq(t.chatHandovers.conversationId, c.id))).length).toBe(1)
  })

  it('complaints and payment claims hand over with their own reason', async () => {
    const a = startChat(db)
    await a.say('Захиалсан цамц маань өөр хэмжээ ирсэн')
    expect((await handoverOf(a.conversationId!)).reason).toBe('complaint')
    const b = startChat(db)
    await b.say('Би мөнгөө шилжүүлсэн')
    expect((await handoverOf(b.conversationId!)).reason).toBe('payment_claim')
  })

  it('takeover pauses the assistant; staff replies reach the customer; handing back resumes it', async () => {
    const chat = startChat(db)
    await chat.say('Ажилтантай холбогдмоор байна')
    const id = chat.conversationId!
    await takeOverConversation(await owner(), { conversationId: id })
    expect(await conversation(id)).toMatchObject({ paused: true })
    expect((await handoverOf(id)).status).toBe('taken')

    // While a person is answering, the assistant says nothing; the message waits for staff.
    expect(await chat.say('Хар hoodie L байгаа юу?')).toBeNull()
    expect(chat.view?.paused).toBe(true)
    expect((await conversation(id)).unreadForStaff).toBeGreaterThan(0)

    await staffReply(await owner(), { conversationId: id, text: 'Сайн байна уу, би туслая.', clientMessageId: 'staff-1-abcdef' })
    const view = await pollConversation(db, id, { channel: 'website', visitorKey: chat.visitorKey, ipHash: null })
    expect(view?.messages.at(-1)).toMatchObject({ role: 'staff', text: 'Сайн байна уу, би туслая.' })
    // Another browser cannot read this conversation.
    expect(await pollConversation(db, id, { channel: 'website', visitorKey: visitor(), ipHash: null })).toBeNull()

    await releaseConversation(await owner(), { conversationId: id })
    expect(await conversation(id)).toMatchObject({ paused: false, needsHuman: false })
    expect((await handoverOf(id)).status).toBe('resolved')
    expect((await chat.say('Хар hoodie L байгаа юу?'))?.text).toContain('Хар / L')
    const audits = await db.select({ action: t.auditLogs.action }).from(t.auditLogs).where(eq(t.auditLogs.entityId, id))
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['conversation.taken_over', 'conversation.staff_reply', 'conversation.released']))
  })

  it('a taken-over chat returns to the assistant after the owner’s silence limit', async () => {
    const chat = startChat(db)
    await chat.say('Ажилтантай ярих')
    const id = chat.conversationId!
    await takeOverConversation(await owner(), { conversationId: id })
    await db.update(t.chatConversations).set({ takenOverAt: new Date(Date.now() - 25 * 3_600_000), lastHumanAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(t.chatConversations.id, id))
    const r = await chat.say('Хүргэлт хэд хоног вэ?')
    expect(r?.text).toContain('Ажлын 1–2 өдөр')
    expect(await conversation(id)).toMatchObject({ paused: false })
    const [auto] = await db.select().from(t.auditLogs).where(and(eq(t.auditLogs.entityId, id), eq(t.auditLogs.action, 'conversation.auto_released')))
    expect(auto).toBeTruthy()
  })
})

describe('AI Chatbot admin permissions', () => {
  it('the role matrix: demo and staff may reply, only owner and manager manage', () => {
    expect(hasPermission('demo', 'assistant.view')).toBe(true)
    expect(hasPermission('demo', 'assistant.reply')).toBe(true)
    expect(hasPermission('demo', 'assistant.manage')).toBe(false)
    expect(hasPermission('staff', 'assistant.reply')).toBe(true)
    expect(hasPermission('staff', 'assistant.manage')).toBe(false)
    expect(hasPermission('manager', 'assistant.manage')).toBe(true)
    expect(hasPermission('owner', 'assistant.manage')).toBe(true)
  })

  it('the public demo acts only on chats its own browser started', async () => {
    const mine = startChat(db)
    await mine.say('Ажилтантай холбогдох')
    const theirs = startChat(db)
    await theirs.say('Ажилтантай холбогдох')
    const demo = { ...ctx(db), actor: await demoActor(db, mine.visitorKey) }
    await expect(takeOverConversation(demo, { conversationId: mine.conversationId! })).resolves.toMatchObject({ already: false })
    await expect(staffReply(demo, { conversationId: mine.conversationId!, text: 'Демо хариулт', clientMessageId: 'demo-1-abcdef' })).resolves.toMatchObject({ sent: true })
    await expect(takeOverConversation(demo, { conversationId: theirs.conversationId! })).rejects.toMatchObject({ code: 'demo_scope' })
    await expect(staffReply(demo, { conversationId: theirs.conversationId!, text: 'x', clientMessageId: 'demo-2-abcdef' })).rejects.toMatchObject({ code: 'demo_scope' })

    // It sees the sample chats and its own, never another visitor's.
    const visible = await db.select({ id: t.chatConversations.id, channel: t.chatConversations.channel }).from(t.chatConversations).where(conversationScope(demo.actor))
    expect(visible.some((c) => c.id === mine.conversationId)).toBe(true)
    expect(visible.some((c) => c.id === theirs.conversationId)).toBe(false)
    expect(visible.some((c) => c.channel === 'sample')).toBe(true)
  })

  it('sample chats are read-only, and the demo cannot change settings or knowledge', async () => {
    const [sample] = await db.select().from(t.chatConversations).where(eq(t.chatConversations.channel, 'sample')).limit(1)
    await expect(takeOverConversation(await owner(), { conversationId: sample.id })).rejects.toMatchObject({ code: 'sample' })
    const demo = { ...ctx(db), actor: await demoActor(db, visitor()) }
    await expect(saveAssistantSettings(demo, defaultAssistantSettings())).rejects.toMatchObject({ code: 'demo_read_only' })
    await expect(saveFaq(demo, { question: 'Тест асуулт?', answer: 'Тест хариулт.', enabled: true })).rejects.toMatchObject({ code: 'demo_read_only' })
  })

  it('the owner’s settings change the assistant: switched off, it stays silent', async () => {
    const o = await owner()
    await saveAssistantSettings(o, { ...defaultAssistantSettings(), enabled: false })
    const chat = startChat(db)
    expect(await chat.say('Хар hoodie L байгаа юу?')).toBeNull()
    expect(chat.view?.enabled).toBe(false)
    await saveAssistantSettings(o, defaultAssistantSettings())
    expect((await chat.say('Хар hoodie L байгаа юу?'))?.text).toContain('Хар / L')
  })

  it('FAQ answers with prices are refused (they would go stale)', async () => {
    await expect(saveFaq(await owner(), { question: 'Hoodie хэд вэ?', answer: 'Hoodie 219,000₮.', enabled: true })).rejects.toMatchObject({ code: 'amount_in_faq' })
  })

  it('the admin test chat never creates real orders or touches the cart', async () => {
    const o = await owner()
    const before = await db.select({ id: t.orders.id }).from(t.orders)
    const send = async (text: string, conversationId?: string) => sendTestMessage(o, { conversationId: conversationId ?? null, clientMessageId: `t-${Math.random().toString(36).slice(2, 12)}`, text })
    let r = await send('Хар hoodie L авъя')
    const id = r.view.conversationId
    for (const text of ['энд захиалъя', 'Бат 9911 2233', 'Хан-Уул, 15-р хороо, 3-р байр, 45 тоот']) r = await send(text, id)
    r = await send('тийм', id)
    expect(r.view.messages.at(-1)?.text).toMatch(/Туршилтын захиалга: №TEST-/)
    expect((await db.select({ id: t.orders.id }).from(t.orders)).length).toBe(before.length)
  })
})
