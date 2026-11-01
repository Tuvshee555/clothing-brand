// Applies pending SQL migrations from ./drizzle to DATABASE_URL.
// Migrations are additive; anything destructive must be reviewed and backed up first
// (`npm run db:backup`).
import { loadEnvConfig } from '@next/env'
import { runMigrations } from './lib/tasks'

async function main() {
  loadEnvConfig(process.cwd())
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  await runMigrations(url)
  console.log('[db] Migrations applied.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
