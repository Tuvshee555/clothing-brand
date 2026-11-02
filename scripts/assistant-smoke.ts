// npm run assistant:smoke — asks the shopping assistant the reference questions
// through the real pipeline (AI mode when OPENAI_API_KEY is set, otherwise
// catalogue mode) as an admin test chat — so no order, cart or visitor record is
// created — and checks every amount in each answer against the database.
// Uses DATABASE_URL (point it at the local development database: npm run db:dev).
import './lib/load-env'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import * as t from '../src/server/db/schema'
import { amountsIn } from '../src/lib/fact-check'
import { handleCustomerMessage } from '../src/server/assistant/handler'
import { allowedAmounts, buildToolContext } from '../src/server/assistant/tools'
import { withDb } from './lib/tasks'

const QUESTIONS = [
  ['Энэ цамц хэд вэ?', 'oxford-shirt'],
  ['Хар өнгө байгаа юу?', 'oversized-hoodie'],
  ['L размер бэлэн байгаа юу?', 'oversized-hoodie'],
  ['Энэ өмдний өөр өнгө бий юу?', 'fleece-joggers'],
  ['200,000₮-өөс доош ямар цамц байна?', null],
  ['Хүргэлт хэд хоног вэ?', null],
  ['Яаж захиалах вэ?', null],
  ['Захиалгынхаа явцыг яаж шалгах вэ?', null],
  ['har hoodie L razmer bga yu', null],
] as const

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const questions: readonly (readonly [string, string | null])[] = only.length ? only.map((q) => [q, null] as const) : QUESTIONS
  let failures = 0
  await withDb(url, async (db) => {
    const [owner] = await db.select({ id: t.users.id }).from(t.users).where(eq(t.users.role, 'owner')).limit(1)
    if (!owner) throw new Error('No owner user in this database (run the seed first).')
    const allowed = allowedAmounts(await buildToolContext(db))
    let conversationId: string | null = null
    for (const [question, pageSlug] of questions) {
      const { view } = await handleCustomerMessage(
        { db, actor: null, now: new Date(), ipHash: `smoke-${randomUUID()}` },
        { conversationId, clientMessageId: `smoke-${randomUUID()}`, text: question, pageSlug },
        { channel: 'test', visitorKey: null, testUserId: owner.id, ipHash: `smoke-${randomUUID()}` },
      )
      conversationId = view.conversationId
      const reply = view.messages.at(-1)
      const text = reply?.role === 'assistant' ? reply.text : '(no reply)'
      const unknown = amountsIn(text).filter((a) => !allowed.has(a) && !amountsIn(question).includes(a))
      if (unknown.length) failures++
      console.log(`\n▶ ${question}${pageSlug ? `  [page: ${pageSlug}]` : ''}\n[${reply?.mode ?? '?'}] ${text}`)
      console.log(unknown.length ? `  ✗ amounts not in the database: ${unknown.join(', ')}` : '  ✓ every amount matches the database')
    }
    // Test chats are the admin's own; remove this one again.
    if (conversationId) await db.delete(t.chatConversations).where(eq(t.chatConversations.id, conversationId))
  })
  if (failures) {
    console.error(`\n${failures} answer(s) mentioned amounts that are not in the database.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
