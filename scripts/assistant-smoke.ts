// npm run assistant:smoke — asks the shopping assistant the reference questions
// through the real pipeline (AI mode when OPENAI_API_KEY is set, otherwise
// catalogue mode) and checks every amount in each answer against the database.
// Uses DATABASE_URL; each AI answer is logged in store.ai_usage like any other.
import './lib/load-env'
import { amountsIn } from '../src/lib/fact-check'
import { answerAssistant } from '../src/server/assistant'
import { allowedAmounts, buildToolContext } from '../src/server/assistant/tools'
import { withDb } from './lib/tasks'

const QUESTIONS = [
  'Ямар hoodie байна?',
  'Хар hoodie байна уу?',
  'Хар hoodie L размер байгаа юу?',
  'Хамгийн хямд хүрэм аль нь вэ?',
  '200,000₮-өөс доош ямар бараа байна?',
  'Оксфорд цамц болон маалинган цамцны ялгаа юу вэ?',
  'Өвөлд ямар хувцас тохирох вэ?',
  'Яаж захиалах вэ?',
  'Хүргэлтийн нөхцөл ямар вэ?',
  'Захиалгаа өөрчилж болох уу?',
]

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const questions = only.length ? only : QUESTIONS
  let failures = 0
  await withDb(url, async (db) => {
    const allowed = allowedAmounts(await buildToolContext(db))
    for (const question of questions) {
      const reply = await answerAssistant(db, { messages: [{ role: 'user', content: question }] }, { ipHash: `smoke-${Date.now()}` })
      const unknown = amountsIn(reply.reply).filter((a) => !allowed.has(a) && !amountsIn(question).includes(a))
      if (unknown.length) failures++
      console.log(`\n▶ ${question}\n[${reply.mode}] ${reply.reply}`)
      if (reply.products.length) console.log(`  cards: ${reply.products.map((p) => p.slug).join(', ')}`)
      console.log(unknown.length ? `  ✗ amounts not in the database: ${unknown.join(', ')}` : '  ✓ every amount matches the database')
    }
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
