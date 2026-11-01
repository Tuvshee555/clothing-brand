// Database factory without the `server-only` guard so scripts (migrate, seed)
// and tests can create connections. App code imports `@/server/db`.
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { Pool, type PoolConfig } from 'pg'
import * as schema from './schema'

export type Schema = typeof schema

/** Accepted by every data function: the root database or an open transaction. */
export type Database = PgDatabase<NodePgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

/**
 * node-postgres currently treats sslmode=require as verify-full and warns that this
 * will change; ask for verify-full explicitly (Neon's certificates are publicly trusted).
 */
export function normalizeConnectionString(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/, '$1sslmode=verify-full')
}

export function createPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: normalizeConnectionString(connectionString),
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    ...overrides,
  })
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' })
}

export { schema }
