// The Meta webhook end to end against a real (throwaway) database, with the
// Graph API mocked: signed events in, the MANAN assistant's answer out —
// once, even when Meta retries; nothing sent while outbound is off; a staff
// reply in the Page inbox silences the assistant; comments get one private
// reply only when enabled; other Pages and stale messages are ignored.
import { and, eq } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as t from '@/server/db/schema'
import { mananMetaAdapter, metaVisitorKey } from '@/server/meta/adapter'
import { BOT_METADATA } from '@/server/meta/graph'
import { clearPageTokenCache, signHubRequest } from '@/server/meta/hub-client'
import { processReceipt } from '@/server/meta/process'
import { metaConfig } from '@/server/meta/config'
import { conversationScope } from '@/server/queries/assistant-scope'
import { receiveWebhook, verifySubscription } from '@/server/meta/webhook'
import { createTestDb, demoActor, type TestDb } from './helpers'

const PAGE = '1111111111'
const IG = '2222222222'
const SECRET = 'test-app-secret'
const VERIFY = 'verify-token-1234567890'

let db: TestDb
let cleanup: () => Promise<void>
let sent: { url: URL; body: { recipient: Record<string, string>; messaging_type: string; message: { text: string; metadata: string; quick_replies?: unknown[] } } }[]
let graphStatus: number

beforeAll(async () => {
  delete process.env.OPENAI_API_KEY
  ;({ db, cleanup } = await createTestDb())
})
afterAll(() => cleanup())

beforeEach(() => {
  vi.stubEnv('META_APP_SECRET', SECRET)
  vi.stubEnv('META_VERIFY_TOKEN', VERIFY)
  vi.stubEnv('META_PAGE_ID', PAGE)
  vi.stubEnv('META_PAGE_ACCESS_TOKEN', 'test-page-token')
  vi.stubEnv('META_INSTAGRAM_ACCOUNT_ID', IG)
  vi.stubEnv('META_OUTBOUND_ENABLED', 'true')
  vi.stubEnv('META_COMMENT_REPLIES_ENABLED', '')
  sent = []
  graphStatus = 200
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.hostname !== 'graph.facebook.com') throw new Error(`unexpected fetch ${url.hostname}`)
      sent.push({ url, body: JSON.parse(String(init?.body)) })
      if (graphStatus !== 200) return Response.json({ error: { code: 2, message: 'temporary' } }, { status: graphStatus })
      return Response.json({ recipient_id: '1', message_id: `m_sent_${sent.length}_${Math.random().toString(36).slice(2)}` })
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const sign = (raw: string, secret = SECRET) => `sha256=${createHmac('sha256', secret).update(Buffer.from(raw)).digest('hex')}`

/** Delivers a payload like Meta would and runs the scheduled processing to completion. */
async function deliver(payload: unknown, secret = SECRET) {
  const raw = JSON.stringify(payload)
  const tasks: Promise<void>[] = []
  const res = await receiveWebhook(
    new Request('https://shop.test/api/meta/webhook', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw, secret) } }),
    db,
    mananMetaAdapter,
    (task) => void tasks.push(task()),
  )
  await Promise.all(tasks)
  return res
}

let seq = 0
const mid = () => `m_test_${Date.now()}_${seq++}`
const dm = (sender: string, text: string, id = mid(), at = Date.now()) => ({ object: 'page', entry: [{ id: PAGE, time: at, messaging: [{ sender: { id: sender }, recipient: { id: PAGE }, timestamp: at, message: { mid: id, text } }] }] })
const igDm = (sender: string, text: string) => ({ object: 'instagram', entry: [{ id: IG, time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: IG }, timestamp: Date.now(), message: { mid: mid(), text } }] }] })
const echo = (customer: string, text: string, extra: Record<string, unknown> = {}) => ({ object: 'page', entry: [{ id: PAGE, time: Date.now(), messaging: [{ sender: { id: PAGE }, recipient: { id: customer }, timestamp: Date.now(), message: { mid: mid(), text, is_echo: true, ...extra } }] }] })
const comment = (from: string, text: string, commentId: string) => ({ object: 'page', entry: [{ id: PAGE, time: Date.now(), changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: commentId, post_id: '10', message: text, from: { id: from }, created_time: Math.floor(Date.now() / 1000) } }] }] })

async function conversationOf(platform: 'messenger' | 'instagram', sender: string, account = PAGE) {
  const [c] = await db.select().from(t.chatConversations).where(and(eq(t.chatConversations.channel, platform), eq(t.chatConversations.visitorId, metaVisitorKey(platform, account, sender))))
  return c
}
const messagesOf = (conversationId: string) => db.select().from(t.chatMessages).where(eq(t.chatMessages.conversationId, conversationId)).orderBy(t.chatMessages.createdAt)

describe('subscription handshake', () => {
  it('echoes the challenge only for the right verify token, and stays closed until configured', () => {
    const url = (token: string) => `https://shop.test/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`
    const ok = verifySubscription(new Request(url(VERIFY)))
    expect(ok.status).toBe(200)
    expect(verifySubscription(new Request(url('wrong-token-1234567890'))).status).toBe(403)
    vi.stubEnv('META_PAGE_ACCESS_TOKEN', '')
    expect(verifySubscription(new Request(url(VERIFY))).status).toBe(503)
  })
})

describe('Messenger messages', () => {
  it('rejects an unsigned or wrongly signed delivery and stores nothing', async () => {
    const before = await db.$count(t.metaWebhookEvents)
    expect((await deliver(dm('3000000001', 'Сайн уу'), 'not-the-secret')).status).toBe(401)
    expect(await db.$count(t.metaWebhookEvents)).toBe(before)
    expect(sent).toHaveLength(0)
  })

  it('answers with the MANAN assistant, once, in Cyrillic and Latin Mongolian', async () => {
    const res = await deliver(dm('3000000002', 'Хар hoodie L байгаа юу?'))
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].url.pathname).toBe(`/v25.0/${PAGE}/messages`)
    expect(sent[0].url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/)
    expect(sent[0].body).toMatchObject({ recipient: { id: '3000000002' }, messaging_type: 'RESPONSE', message: { metadata: BOT_METADATA } })
    expect(sent[0].body.message.text.length).toBeGreaterThan(10)

    await deliver(dm('3000000002', 'har hoodie M baigaa yu'))
    expect(sent).toHaveLength(2)
    const c = await conversationOf('messenger', '3000000002')
    expect(c.isDemo).toBe(true)
    const roles = (await messagesOf(c.id)).map((m) => m.role)
    expect(roles).toEqual(['customer', 'assistant', 'customer', 'assistant'])
  })

  it('a webhook retry of the same message is recognised: no second reply, no duplicate messages', async () => {
    const payload = dm('3000000003', 'Ямар хүргэлт байдаг вэ?')
    await deliver(payload)
    await deliver(payload)
    await deliver(payload)
    expect(sent).toHaveLength(1)
    const c = await conversationOf('messenger', '3000000003')
    expect((await messagesOf(c.id)).length).toBe(2)
    const receipts = await db.select().from(t.metaWebhookEvents).where(eq(t.metaWebhookEvents.kind, 'message'))
    // The customer's text is not kept on the receipt once handled.
    expect(receipts.every((r) => r.status !== 'done' || !('text' in (r.payload as object)))).toBe(true)
  })

  it('with outbound off the reply is generated and logged but nothing is sent', async () => {
    vi.stubEnv('META_OUTBOUND_ENABLED', '')
    await deliver(dm('3000000004', 'Хэмжээний хүснэгт байна уу?'))
    expect(sent).toHaveLength(0)
    const c = await conversationOf('messenger', '3000000004')
    expect((await messagesOf(c.id)).map((m) => m.role)).toEqual(['customer', 'assistant'])
    const [receipt] = await db.select().from(t.metaWebhookEvents).where(and(eq(t.metaWebhookEvents.kind, 'message'), eq(t.metaWebhookEvents.outcome, 'suppressed')))
    expect(receipt.status).toBe('done')
  })

  it('a failed send is retried later with the same answer, never a second one', async () => {
    graphStatus = 500
    const payload = dm('3000000005', 'Буцаалт хийж болох уу?')
    await deliver(payload)
    expect(sent).toHaveLength(1)
    const [failed] = await db.select().from(t.metaWebhookEvents).where(eq(t.metaWebhookEvents.status, 'failed'))
    expect(failed.outcome).toMatch(/^send_failed:http_500/)
    graphStatus = 200
    await processReceipt(db, metaConfig()!, mananMetaAdapter, failed.id)
    expect(sent).toHaveLength(2)
    expect(sent[1].body.message.text).toBe(sent[0].body.message.text)
    const c = await conversationOf('messenger', '3000000005')
    expect((await messagesOf(c.id)).filter((m) => m.role === 'assistant')).toHaveLength(1)
    const [done] = await db.select().from(t.metaWebhookEvents).where(eq(t.metaWebhookEvents.id, failed.id))
    expect(done.status).toBe('done')
  })

  it('does not answer a message older than the 24-hour window', async () => {
    await deliver(dm('3000000006', 'Сайн уу', mid(), Date.now() - 25 * 3_600_000))
    expect(sent).toHaveLength(0)
    expect(await db.$count(t.metaWebhookEvents, eq(t.metaWebhookEvents.status, 'expired'))).toBeGreaterThan(0)
  })

  it('ignores events for a Page this deployment does not own', async () => {
    const before = await db.$count(t.metaWebhookEvents)
    const other = { object: 'page', entry: [{ id: '9999999999', time: Date.now(), messaging: [{ sender: { id: '3000000007' }, recipient: { id: '9999999999' }, timestamp: Date.now(), message: { mid: mid(), text: 'hi' } }] }] }
    expect((await deliver(other)).status).toBe(200)
    expect(await db.$count(t.metaWebhookEvents)).toBe(before)
    expect(sent).toHaveLength(0)
  })
})

describe('human handover', () => {
  it('a reply typed in the Page inbox takes the chat over: the assistant stays silent', async () => {
    await deliver(dm('3000000010', 'Ажилтантай ярья'))
    expect(sent).toHaveLength(1)
    await deliver(echo('3000000010', 'Сайн байна уу, би Сараа байна.', { app_id: 263902037430900 }))
    const c = await conversationOf('messenger', '3000000010')
    expect(c.paused).toBe(true)
    expect((await messagesOf(c.id)).at(-1)).toMatchObject({ role: 'staff', text: 'Сайн байна уу, би Сараа байна.' })
    await deliver(dm('3000000010', 'Баярлалаа, хэзээ хүргэх вэ?'))
    expect(sent).toHaveLength(1)
    expect((await messagesOf(c.id)).at(-1)).toMatchObject({ role: 'customer' })
  })

  it("the assistant's own echoes never count as a staff reply", async () => {
    await deliver(dm('3000000011', 'Сайн уу'))
    await deliver(echo('3000000011', sent[0].body.message.text, { metadata: BOT_METADATA }))
    expect((await conversationOf('messenger', '3000000011')).paused).toBe(false)
  })

  it('Messenger chats are visible to staff but never to the public demo role', async () => {
    const demo = await demoActor(db, 'visitor-meta-test')
    const visible = await db.select({ channel: t.chatConversations.channel }).from(t.chatConversations).where(conversationScope(demo))
    expect(visible.some((c) => c.channel === 'messenger' || c.channel === 'instagram')).toBe(false)
  })
})

describe('Instagram', () => {
  it('answers an Instagram DM through the Page, keyed to the Instagram account', async () => {
    await deliver(igDm('4000000001', 'une hed ve, cashmere tsamts'))
    expect(sent).toHaveLength(1)
    expect(sent[0].url.pathname).toBe(`/v25.0/${PAGE}/messages`)
    expect(sent[0].body.recipient).toEqual({ id: '4000000001' })
    expect((await conversationOf('instagram', '4000000001', IG)).channel).toBe('instagram')
  })
})

describe('comment triggers', () => {
  it('are off by default', async () => {
    await deliver(comment('5000000001', 'Үнэ хэд вэ?', '10_100'))
    expect(sent).toHaveLength(0)
  })

  it('when enabled, send one private reply to a matching comment and nothing else', async () => {
    vi.stubEnv('META_COMMENT_REPLIES_ENABLED', 'true')
    await deliver(comment('5000000002', 'Энэ цамц хэдээр вэ?', '10_101'))
    await deliver(comment('5000000002', 'Энэ цамц хэдээр вэ?', '10_101'))
    await deliver(comment('5000000003', 'Гоё байна 😍', '10_102'))
    expect(sent).toHaveLength(1)
    expect(sent[0].url.pathname).toBe(`/v25.0/${PAGE}/messages`)
    expect(sent[0].body.recipient).toEqual({ comment_id: '10_101' })
    expect(sent[0].body.message.text).toContain('Messenger')
  })
})

describe('behind the Ursgal hub', () => {
  const ROUTE = '0123456789abcdef'
  const HUB_SECRET = 'route-secret-'.padEnd(43, 'x')
  const HUB_TOKEN = 'token-from-the-hub'
  const PROOF = 'a'.repeat(64)
  let tokenRequests: number
  let hubStatus: number

  beforeEach(() => {
    vi.stubEnv('META_APP_SECRET', '')
    vi.stubEnv('META_VERIFY_TOKEN', '')
    vi.stubEnv('META_PAGE_ACCESS_TOKEN', '')
    vi.stubEnv('URSGAL_HUB_URL', 'https://hub.test')
    vi.stubEnv('URSGAL_HUB_ROUTE_ID', ROUTE)
    vi.stubEnv('URSGAL_HUB_SECRET', HUB_SECRET)
    tokenRequests = 0
    hubStatus = 200
    clearPageTokenCache()
    const graph = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input))
        if (url.hostname !== 'hub.test') return graph(input, init)
        tokenRequests++
        expect(url.pathname).toBe('/api/meta/page-token')
        const headers = new Headers(init?.headers)
        expect(headers.get('x-ursgal-route')).toBe(ROUTE)
        expect(JSON.parse(String(init?.body))).toEqual({ pageId: PAGE })
        if (hubStatus !== 200) return Response.json({ error: 'unauthorized' }, { status: hubStatus })
        return Response.json({ token: HUB_TOKEN, instagramId: IG, appsecretProof: PROOF })
      }),
    )
  })

  async function forwarded(payload: unknown, secret = HUB_SECRET) {
    const raw = JSON.stringify(payload)
    const tasks: Promise<void>[] = []
    const res = await receiveWebhook(
      new Request('https://shop.test/api/meta/webhook', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', ...signHubRequest(ROUTE, secret, raw) } }),
      db,
      mananMetaAdapter,
      (task) => void tasks.push(task()),
    )
    await Promise.all(tasks)
    return res
  }

  it("answers a delivery signed with the route's secret, using the hub's Page token and proof", async () => {
    expect((await forwarded(dm('6000000001', 'Сайн байна уу'))).status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].url.searchParams.get('access_token')).toBe(HUB_TOKEN)
    expect(sent[0].url.searchParams.get('appsecret_proof')).toBe(PROOF)
    await forwarded(dm('6000000001', 'hoodie baigaa yu'))
    expect(sent).toHaveLength(2)
    expect(tokenRequests).toBe(1) // kept for 10 minutes
  })

  it("refuses Meta's own signature, another route's secret and the GET handshake", async () => {
    const before = await db.$count(t.metaWebhookEvents)
    expect((await deliver(dm('6000000002', 'Сайн уу'))).status).toBe(401)
    expect((await forwarded(dm('6000000002', 'Сайн уу'), 'another-route-secret'.padEnd(43, 'y'))).status).toBe(401)
    expect(await db.$count(t.metaWebhookEvents)).toBe(before)
    const handshake = `https://shop.test/api/meta/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=1`
    expect(verifySubscription(new Request(handshake)).status).toBe(404)
  })

  it('a refused token request is retried later with the same answer, and nothing reaches Meta meanwhile', async () => {
    hubStatus = 401
    const payload = dm('6000000003', 'Хүргэлт хэд хоног вэ?')
    await forwarded(payload)
    expect(sent).toHaveLength(0)
    const [receipt] = await db.select().from(t.metaWebhookEvents).where(and(eq(t.metaWebhookEvents.status, 'failed'), eq(t.metaWebhookEvents.outcome, 'send_failed:hub_token_401')))
    expect(receipt).toBeDefined()
    hubStatus = 200
    await processReceipt(db, metaConfig()!, mananMetaAdapter, receipt.id)
    expect(sent).toHaveLength(1)
  })
})
