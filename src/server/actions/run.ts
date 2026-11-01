// Shared plumbing for server actions (not itself a 'use server' module).
import 'server-only'
import { refresh } from 'next/cache'
import { z } from 'zod'
import '@/lib/validation/mn-errors'
import { hasPermission, type Permission } from '@/lib/roles'
import { fieldErrors } from '@/lib/validation/common'
import { ERR, ServiceError, type Actor, type ServiceContext } from '@/server/context'
import { requestContext } from '@/server/request'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; details?: unknown }

export function toFailure(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string>; details?: unknown } {
  if (err instanceof ServiceError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors, details: err.details }
  if (err instanceof z.ZodError) {
    return { ok: false, error: err.issues[0]?.message ?? 'Мэдээллээ шалгана уу.', fieldErrors: fieldErrors(err) }
  }
  console.error('[action]', err)
  return { ok: false, error: 'Алдаа гарлаа. Дахин оролдоно уу.' }
}

/** Runs an admin action: signed in, permission checked, rate limited, then refreshes the router. */
export async function runAdminAction<T>(
  permission: Permission,
  fn: (ctx: ServiceContext & { actor: Actor }) => Promise<T>,
  { refreshRouter = true }: { refreshRouter?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const ctx = await requestContext()
    if (!ctx.actor) throw ERR.unauthenticated()
    if (!hasPermission(ctx.actor.role, permission)) throw ctx.actor.role === 'demo' ? ERR.demoReadOnly() : ERR.forbidden()
    await enforceRateLimit(ctx.db, LIMITS.adminWrite, ctx.actor.userId)
    const data = await fn(ctx as ServiceContext & { actor: Actor })
    if (refreshRouter) refresh()
    return { ok: true, data }
  } catch (err) {
    return toFailure(err)
  }
}
