import 'server-only'
import { attachDatabasePool } from '@vercel/functions'
import type { Pool } from 'pg'
import { createDb, createPool, type Database } from './client'

// One pool per server instance. In development the module can be re-evaluated on
// hot reload, so the pool is kept on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __storePool?: Pool }

function getPool(): Pool {
  if (!globalForDb.__storePool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    // On Vercel a paused instance can wake up holding connections Neon has already
    // closed ("Connection terminated unexpectedly"). Short idle times plus Vercel's
    // helper close idle connections before the instance is paused.
    globalForDb.__storePool = createPool(url, { idleTimeoutMillis: 5_000 })
    attachDatabasePool(globalForDb.__storePool)
  }
  return globalForDb.__storePool
}

export const db: Database = createDb(getPool())

export type { Database }
export * as t from './schema'
