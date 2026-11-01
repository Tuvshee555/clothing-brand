// npm run db:seed — idempotent: adds the demo catalogue, settings, demo user,
// sample orders and (when ADMIN_EMAIL / ADMIN_PASSWORD are set) the owner account.
// Existing rows are never overwritten.
import { loadEnvConfig } from '@next/env'
import { seed } from '../src/server/seed'
import { withDb } from './lib/tasks'

async function main() {
  loadEnvConfig(process.cwd())
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env
  if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters')
  const log = await withDb(url, (db) =>
    seed(db, {
      owner: ADMIN_EMAIL && ADMIN_PASSWORD ? { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME || 'Эзэмшигч' } : null,
      sampleOrders: !process.argv.includes('--no-sample-orders'),
    }),
  )
  for (const line of log) console.log(`[seed] ${line}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
