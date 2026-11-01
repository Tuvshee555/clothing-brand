import 'server-only'
import { cookies } from 'next/headers'
import { randomToken, visitorKeyOf } from '@/server/security/crypto'

// One random, httpOnly id per browser ties together its cart, its demo orders
// and (for the public demo admin) which orders it may see. The database only
// ever stores visitorKeyOf(id).
export const VISITOR_COOKIE = 'mn_vid'
const VALID = /^[A-Za-z0-9_-]{20,64}$/

/** The visitor key for this request, or null when the browser has none yet. Safe in pages. */
export async function readVisitorKey(): Promise<string | null> {
  const value = (await cookies()).get(VISITOR_COOKIE)?.value
  return value && VALID.test(value) ? visitorKeyOf(value) : null
}

/** Server Actions / Route Handlers: returns the visitor key, issuing the cookie first if needed. */
export async function ensureVisitorKey(): Promise<string> {
  const jar = await cookies()
  let value = jar.get(VISITOR_COOKIE)?.value
  if (!value || !VALID.test(value)) {
    value = randomToken(24)
    jar.set(VISITOR_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return visitorKeyOf(value)
}
