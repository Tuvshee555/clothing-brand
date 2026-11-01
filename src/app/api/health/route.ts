import { sql } from 'drizzle-orm'
import { connection } from 'next/server'
import { db } from '@/server/db'

/** Uptime check: app + database. Never cached, reveals nothing sensitive. */
export async function GET() {
  await connection()
  try {
    await db.execute(sql`select 1`)
    return Response.json({ ok: true, db: 'up' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
