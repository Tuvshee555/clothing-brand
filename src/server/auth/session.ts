import 'server-only'
import { and, eq, gt, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Role } from '@/lib/roles'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { randomToken, sha256Hex } from '@/server/security/crypto'

export const SESSION_COOKIE = 'mn_admin'
const STAFF_SESSION_HOURS = 24 * 7
/** Public demo sessions are short and end with the visit. */
export const DEMO_SESSION_HOURS = 4

export interface SessionUser {
  sessionId: string
  userId: string
  role: Role
  name: string
  email: string
  visitorKey: string | null
}

/** Creates a session row and sets the httpOnly cookie. Server Actions / Route Handlers only. */
export async function createSession(
  userId: string,
  { userAgent, visitorKey = null, hours = STAFF_SESSION_HOURS }: { userAgent: string | null; visitorKey?: string | null; hours?: number },
) {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + hours * 3_600_000)
  await db.insert(t.sessions).values({
    id: sha256Hex(token),
    userId,
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
    visitorId: visitorKey,
  })
  await db.update(t.users).set({ lastLoginAt: new Date() }).where(eq(t.users.id, userId))
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

/** The signed-in admin user for this request (memoised per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 100) return null
  const rows = await db
    .select({
      sessionId: t.sessions.id,
      userId: t.users.id,
      role: t.users.role,
      name: t.users.name,
      email: t.users.email,
      visitorKey: t.sessions.visitorId,
    })
    .from(t.sessions)
    .innerJoin(t.users, eq(t.users.id, t.sessions.userId))
    // Compared with the database clock so prerendering never reads the JS clock here.
    .where(and(eq(t.sessions.id, sha256Hex(token)), gt(t.sessions.expiresAt, sql`now()`), eq(t.users.isActive, true)))
    .limit(1)
  return rows[0] ?? null
})

export async function destroySession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await db.delete(t.sessions).where(eq(t.sessions.id, sha256Hex(token)))
  jar.delete(SESSION_COOKIE)
}

/** Signs a user out everywhere (password change). */
export async function destroyAllSessions(userId: string) {
  await db.delete(t.sessions).where(eq(t.sessions.userId, userId))
}
