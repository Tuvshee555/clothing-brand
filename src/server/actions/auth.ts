'use server'

import { and, eq, ne } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { changePasswordInput, loginInput } from '@/lib/validation/admin'
import { audit } from '@/server/audit'
import { actionActor, safeNextPath } from '@/server/auth/current'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '@/server/auth/password'
import { createSession, DEMO_SESSION_HOURS, destroyAllSessions, destroySession } from '@/server/auth/session'
import { ERR } from '@/server/context'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { clientIp, userAgent } from '@/server/request'
import { hashIp } from '@/server/security/crypto'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { ensureVisitorKey } from '@/server/visitor'
import { toFailure, type ActionResult } from './run'

export const DEMO_EMAIL = 'demo@manan.example'

/** Public portfolio demo: a short, restricted session scoped to this browser's own orders. */
export async function enterDemoAction(next?: string): Promise<ActionResult<null>> {
  let target: string
  try {
    await enforceRateLimit(db, LIMITS.demoLogin, hashIp(await clientIp()) ?? 'anonymous')
    const visitorKey = await ensureVisitorKey()
    const [demo] = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(and(eq(t.users.email, DEMO_EMAIL), eq(t.users.role, 'demo'), eq(t.users.isActive, true)))
      .limit(1)
    if (!demo) return { ok: false, error: 'Демо бүртгэл тохируулагдаагүй байна.' }
    await createSession(demo.id, { userAgent: await userAgent(), visitorKey, hours: DEMO_SESSION_HOURS })
    await audit(db, null, 'demo.entered', { type: 'user', id: demo.id })
    target = safeNextPath(next, '/admin')
  } catch (err) {
    return toFailure(err)
  }
  redirect(target)
}

export async function loginAction(raw: { email: string; password: string; next?: string }): Promise<ActionResult<null>> {
  let target: string
  try {
    const input = loginInput.parse(raw)
    const ip = hashIp(await clientIp()) ?? 'anonymous'
    await enforceRateLimit(db, LIMITS.login, ip)
    await enforceRateLimit(db, LIMITS.login, `email:${input.email}`)
    const [user] = await db
      .select()
      .from(t.users)
      .where(and(eq(t.users.email, input.email), ne(t.users.role, 'demo'), eq(t.users.isActive, true)))
      .limit(1)
    // Always run the hash check so unknown e-mails take as long as wrong passwords.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
    if (!user || !ok) return { ok: false, error: 'И-мэйл эсвэл нууц үг буруу байна.' }
    await createSession(user.id, { userAgent: await userAgent() })
    await audit(db, { userId: user.id, role: user.role, name: user.name, email: user.email, visitorKey: null }, 'user.login', { type: 'user', id: user.id })
    target = safeNextPath(raw.next, '/admin')
  } catch (err) {
    return toFailure(err)
  }
  redirect(target)
}

export async function logoutAction() {
  await destroySession()
  redirect('/admin/login')
}

export async function changePasswordAction(raw: unknown): Promise<ActionResult<null>> {
  try {
    const actor = await actionActor()
    if (actor.role === 'demo') throw ERR.demoReadOnly()
    const input = changePasswordInput.parse(raw)
    await enforceRateLimit(db, LIMITS.login, `pw:${actor.userId}`)
    const [user] = await db.select().from(t.users).where(eq(t.users.id, actor.userId)).limit(1)
    if (!user || !(await verifyPassword(input.current, user.passwordHash))) {
      return { ok: false, error: 'Одоогийн нууц үг буруу байна.', fieldErrors: { current: 'Одоогийн нууц үг буруу байна.' } }
    }
    await db.update(t.users).set({ passwordHash: await hashPassword(input.next) }).where(eq(t.users.id, user.id))
    await audit(db, actor, 'user.password_changed', { type: 'user', id: user.id })
    await destroyAllSessions(user.id)
  } catch (err) {
    return toFailure(err)
  }
  redirect('/admin/login?changed=1')
}
