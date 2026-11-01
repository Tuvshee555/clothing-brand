import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { hasPermission, type Permission } from '@/lib/roles'
import { ERR, type Actor } from '@/server/context'
import { getSessionUser } from './session'

/** The current admin actor (memoised per request). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const user = await getSessionUser()
  if (!user) return null
  return {
    userId: user.userId,
    role: user.role,
    name: user.name,
    email: user.email,
    visitorKey: user.role === 'demo' ? user.visitorKey : null,
  }
})

// ---- Page guards (redirect) ------------------------------------------------

export async function requireAdminPage(next: string, permission?: Permission): Promise<Actor> {
  const actor = await getActor()
  if (!actor) redirect(`/admin/login?next=${encodeURIComponent(next)}`)
  if (permission && !hasPermission(actor.role, permission)) redirect('/admin?denied=1')
  return actor
}

// ---- Action guards (throw ServiceError) ------------------------------------

export async function actionActor(): Promise<Actor> {
  const actor = await getActor()
  if (!actor) throw ERR.unauthenticated()
  return actor
}

export async function actionPermission(permission: Permission): Promise<Actor> {
  const actor = await actionActor()
  if (!hasPermission(actor.role, permission)) throw actor.role === 'demo' ? ERR.demoReadOnly() : ERR.forbidden()
  return actor
}

/** Only same-site relative redirect targets (prevents open redirects). */
export function safeNextPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
