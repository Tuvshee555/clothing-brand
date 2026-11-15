// Runs before `next build`. On a Vercel production build it applies pending SQL
// migrations from ./drizzle and the idempotent seed (adds missing settings and the
// assistant's defaults; never overwrites, no owner account, no sample orders), so
// new tables and defaults exist before the new code goes live. A failure fails the
// build and the previous deployment keeps serving. Everywhere else (local builds,
// previews without a database) it does nothing.
import { seed } from '../src/server/seed'
import { runMigrations, withDb } from './lib/tasks'

async function main() {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('[db] Not a production deploy — migrations skipped.')
    return
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set for the production build')
  await runMigrations(url)
  console.log('[db] Migrations applied.')
  const log = await withDb(url, (db) => seed(db, { owner: null, sampleOrders: false }))
  for (const line of log) console.log(`[seed] ${line}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
