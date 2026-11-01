// QPay calls this after a payment. The request itself is never trusted: we
// only use it as a hint to ask QPay (payment/check) whether the invoice is
// really paid. Replays are harmless. In the demo's simulation mode it is a no-op.
import { connection } from 'next/server'
import { db } from '@/server/db'
import { hashIp } from '@/server/security/crypto'
import { hitRateLimit, LIMITS } from '@/server/security/rate-limit'
import { verifyQpayPayment } from '@/server/services/orders'

async function handle(req: Request): Promise<Response> {
  await connection()
  const url = new URL(req.url)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip')
  if (!(await hitRateLimit(db, LIMITS.payment, `cb:${hashIp(ip) ?? 'anonymous'}`))) return new Response('Too many requests', { status: 429 })
  const number = url.searchParams.get('order') ?? ''
  if (!/^MN-\d{5,9}$/.test(number)) return new Response('Bad request', { status: 400 })
  try {
    const outcome = await verifyQpayPayment({ db, actor: null, now: new Date() }, number)
    return Response.json({ ok: true, outcome })
  } catch (err) {
    console.error('[qpay] callback failed', err instanceof Error ? err.message : err)
    // A 5xx lets QPay retry; the next attempt re-checks from scratch.
    return new Response('Temporary error', { status: 503 })
  }
}

export const GET = handle
export const POST = handle
