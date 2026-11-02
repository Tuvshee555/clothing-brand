// AI mode with the OpenAI API stubbed (no real model, no key): the strategy
// (rules first, model for open questions), the fact check, the fallback, the
// budget, the owner's switches and model choice, and a takeover during the
// model's wait. Usage is logged with an estimated cost.
import { desc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultAssistantSettings } from '@/lib/assistant/settings'
import * as t from '@/server/db/schema'
import { resetSweepForTests } from '@/server/assistant/handler'
import { saveAssistantSettings, takeOverConversation } from '@/server/services/assistant-admin'
import { ctx, createTestDb, ownerActor, variant, type TestDb } from './helpers'
import { lastMeta, startChat } from './chat-helpers'

let db: TestDb
let cleanup: () => Promise<void>
beforeAll(async () => {
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())
afterEach(async () => {
  vi.unstubAllGlobals()
  delete process.env.OPENAI_API_KEY
  await db.delete(t.aiUsage)
  await saveAssistantSettings({ ...ctx(db), actor: await ownerActor(db) }, defaultAssistantSettings())
  resetSweepForTests()
})

type Step = { tool?: { name: string; args: Record<string, unknown> }; content?: string; status?: number; before?: () => Promise<void> }

/** Stubs the OpenAI endpoint with a script of responses; returns the request bodies it received. */
function stubOpenAI(script: Step[]) {
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key'
  const bodies: { model: string; tool_choice: string; messages: { role: string; content: string | null }[] }[] = []
  let i = 0
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
    bodies.push(JSON.parse(String(init?.body)))
    const step = script[Math.min(i++, script.length - 1)]
    await step.before?.()
    if (step.status) return new Response('{"error":"boom"}', { status: step.status })
    const message = step.tool
      ? { content: null, tool_calls: [{ id: `call_${i}`, type: 'function', function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }
      : { content: step.content ?? '' }
    return Response.json({ choices: [{ message }], usage: { prompt_tokens: 1200, completion_tokens: 150 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, bodies }
}

const OPEN_QUESTION = 'Надад загварлаг хослол санал болгооч'
const checkHoodie = { tool: { name: 'check_stock', args: { product: 'oversized-hoodie', color: 'black', size: 'L' } } }

describe('AI mode (stubbed OpenAI)', () => {
  it('answers an open question with tool facts; usage and cost are logged', async () => {
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    const { bodies } = stubOpenAI([checkHoodie, { content: `[Оверсайз hoodie](/products/oversized-hoodie) — Хар / L: ${blackL.stock} ширхэг байна, 219,000₮. Өргөн шулуун өмдтэй хослуулахад тохиромжтой.` }])
    const chat = startChat(db)
    const r = await chat.say(OPEN_QUESTION)
    expect(r?.mode).toBe('ai')
    expect(r?.text).toContain('Хар / L')
    expect(r?.cards?.map((c) => c.slug)).toContain('oversized-hoodie')
    expect(bodies[0].model).toBe('gpt-4.1-mini')
    expect(bodies[0].tool_choice).toBe('required')
    // The prompt is MANAN's own and carries no catalogue: facts only come from tools.
    expect(bodies[0].messages[0].content).toContain('clothing label')
    expect(bodies[0].messages[0].content).not.toContain('219,000')
    const [usage] = await db.select().from(t.aiUsage)
    expect(usage).toMatchObject({ mode: 'llm', model: 'gpt-4.1-mini', inputTokens: 2400, outputTokens: 300, ok: true, source: 'assistant', conversationId: chat.conversationId })
    expect(usage.costMicroUsd).toBe(Math.ceil(2400 * 0.4 + 300 * 1.6))
  })

  it('an invented price fails the fact check twice → the rules answer, and the problem is logged', async () => {
    stubOpenAI([checkHoodie, { content: 'Оверсайз hoodie ердөө 199,000₮.' }, { content: 'Оверсайз hoodie 199,000₮ байна.' }])
    const chat = startChat(db)
    const r = await chat.say(OPEN_QUESTION)
    expect(r?.mode).toBe('rules')
    expect(r?.text).not.toContain('199,000')
    expect((await lastMeta(db, chat.conversationId!)).events).toContain('ai_rejected')
    const [problem] = await db.select().from(t.chatErrors).where(eq(t.chatErrors.conversationId, chat.conversationId!))
    expect(problem).toMatchObject({ code: 'AI_REPLY_REJECTED', level: 'warning' })
    expect(JSON.stringify(problem.details)).toContain('199000')
    const [usage] = await db.select().from(t.aiUsage)
    expect(usage.ok).toBe(false)
  })

  it('a sold-out variant called available, or a wrong count, is rejected', async () => {
    const blackL = await variant(db, 'oversized-hoodie', 'black', 'L')
    stubOpenAI([checkHoodie, { content: `«Оверсайз hoodie» — Хар / L: ${blackL.stock + 3} ширхэг байна.` }, { content: '«Оверсайз hoodie» — Хар / L дууссан.' }])
    const r = await startChat(db).say(OPEN_QUESTION)
    expect(r?.mode).toBe('rules')
  })

  it('the model may never claim an order was created or paid', async () => {
    stubOpenAI([checkHoodie, { content: 'Захиалга тань үүслээ, төлбөр баталгаажсан.' }, { content: 'Захиалга тань бүртгэгдлээ.' }])
    const r = await startChat(db).say(OPEN_QUESTION)
    expect(r?.mode).toBe('rules')
    expect(r?.text).not.toMatch(/үүслээ|баталгаажсан/)
  })

  it('a failed model call falls back to the rules and is logged without the key', async () => {
    stubOpenAI([{ status: 500 }])
    const chat = startChat(db)
    const r = await chat.say(OPEN_QUESTION)
    expect(r?.mode).toBe('rules')
    expect(r?.text).toBeTruthy()
    const [problem] = await db.select().from(t.chatErrors).where(eq(t.chatErrors.conversationId, chat.conversationId!))
    expect(problem.code).toBe('AI_CALL_FAILED')
    expect(JSON.stringify(problem.details)).not.toContain('sk-test')
  })

  it('exact questions (variant stock, prices, policies) are answered by the rules, not the model', async () => {
    const { fetchMock } = stubOpenAI([{ content: 'unused' }])
    const chat = startChat(db)
    await chat.say('Хар hoodie L байгаа юу?')
    await chat.say('Оксфорд цамц хэд вэ?')
    await chat.say('Хүргэлт хэд хоног вэ?')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('over the daily budget the model is not called', async () => {
    const { fetchMock } = stubOpenAI([{ content: 'unused' }])
    await db.insert(t.aiUsage).values({ mode: 'llm', model: 'gpt-4.1-mini', costMicroUsd: 1_000_001, ok: true })
    const r = await startChat(db).say(OPEN_QUESTION)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r?.mode).toBe('rules')
  })

  it('the owner can keep the rules-only mode, and choose the model', async () => {
    const owner = { ...ctx(db), actor: await ownerActor(db) }
    const { fetchMock, bodies } = stubOpenAI([checkHoodie, { content: 'Энэ улирлын шинэ загваруудаас сонгоорой.' }])
    await saveAssistantSettings(owner, { ...defaultAssistantSettings(), aiEnabled: false })
    await startChat(db).say(OPEN_QUESTION)
    expect(fetchMock).not.toHaveBeenCalled()
    await saveAssistantSettings(owner, { ...defaultAssistantSettings(), aiModel: 'gpt-4.1' })
    const r = await startChat(db).say(OPEN_QUESTION)
    expect(r?.mode).toBe('ai')
    expect(bodies[0].model).toBe('gpt-4.1')
  })

  it('a person taking over during the model’s wait: the reply is not published', async () => {
    const chat = startChat(db)
    await chat.say('Сайн байна уу')
    const id = chat.conversationId!
    stubOpenAI([
      checkHoodie,
      { content: 'Энэ улирлын шинэ загваруудаас сонгоорой.', before: async () => void (await takeOverConversation({ ...ctx(db), actor: await ownerActor(db) }, { conversationId: id })) },
    ])
    expect(await chat.say(OPEN_QUESTION)).toBeNull()
    const [last] = await db.select().from(t.chatMessages).where(eq(t.chatMessages.conversationId, id)).orderBy(desc(t.chatMessages.createdAt)).limit(1)
    expect(last.role).toBe('customer')
  })
})
