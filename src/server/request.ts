import 'server-only'
import { headers } from 'next/headers'
import { getActor } from '@/server/auth/current'
import type { ServiceContext } from '@/server/context'
import { db } from '@/server/db'
import { hashIp } from '@/server/security/crypto'

export async function clientIp(): Promise<string | null> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return h.get('x-real-ip')
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')
}

/** Builds the ServiceContext for the current request. */
export async function requestContext(): Promise<ServiceContext> {
  const [actor, ip] = await Promise.all([getActor(), clientIp()])
  return { db, actor, now: new Date(), ipHash: hashIp(ip) }
}
