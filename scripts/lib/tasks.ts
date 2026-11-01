// Shared database tasks for the CLI scripts and the integration-test setup.
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'
import { createDb, createPool } from '../../src/server/db/client'

export const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')

export async function withDb<T>(url: string, fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const pool = createPool(url, { max: 2 })
  try {
    return await fn(createDb(pool))
  } finally {
    await pool.end()
  }
}

/** Applies pending migrations. Drizzle runs them in one transaction and records them in drizzle.__drizzle_migrations. */
export function runMigrations(url: string) {
  return withDb(url, (db) => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER, migrationsSchema: 'store_migrations' }))
}

export async function storeSchemaExists(url: string): Promise<boolean> {
  return withDb(url, async (db) => {
    const r = await db.execute<{ exists: boolean }>(
      sql`select exists (select 1 from information_schema.tables where table_schema = 'store' and table_name = 'products') as exists`,
    )
    return Boolean(r.rows[0]?.exists)
  })
}
