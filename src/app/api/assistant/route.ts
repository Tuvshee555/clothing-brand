// Shopping assistant endpoint. POST sends a message (and returns the
// conversation), GET returns it again — the widget only polls while a person is
// involved. Same-origin JSON only, size-limited, rate limited per hashed IP; the
// conversation belongs to the browser's httpOnly visitor cookie.
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { appUrl } from '@/server/app-url'
import { handleCustomerMessage, pollConversation } from '@/server/assistant'
import { ServiceError } from '@/server/context'
import { db } from '@/server/db'
import { CATALOG_TAG } from '@/server/queries/catalog'
import { hashIp } from '@/server/security/crypto'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { ensureQpayInvoice, findCustomerOrder } from '@/server/services/orders'
import { ensureVisitorKey, readVisitorKey } from '@/server/visitor'

export const maxDuration = 30

const MAX_BODY = 8_000

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin fetches from older browsers may omit it
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip')
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Хүсэлт буруу байна.' }, 403)
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'Хүсэлт буруу байна.' }, 415)
  const text = await req.text()
  if (text.length > MAX_BODY) return json({ error: 'Мессеж хэт урт байна.' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'Хүсэлт буруу байна.' }, 400)
  }
  try {
    const visitorKey = await ensureVisitorKey()
    const ipHash = hashIp(clientIp(req))
    const ctx = { db, actor: null, now: new Date(), ipHash }
    const result = await handleCustomerMessage(ctx, body, { channel: 'website', visitorKey, ipHash })
    if (result.orderNumber) {
      // Stock was reserved: cached product pages must show it. The demo QPay invoice is created
      // after the order transaction, exactly as for a checkout order.
      revalidateTag(CATALOG_TAG, { expire: 0 })
      const order = await findCustomerOrder(db, result.orderNumber, { visitorKey })
      if (order) await ensureQpayInvoice(db, order, appUrl()).catch((err) => console.error('[qpay] invoice', err))
    }
    return json(result.view)
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === 'rate_limited' ? 429 : err.code === 'busy' || err.code === 'message_id_reused' ? 409 : 400
      return json({ error: err.message }, status)
    }
    if (err instanceof z.ZodError) {
      // Old widget versions sent { messages: [...] }: ask for a refresh instead of failing silently.
      return json({ error: 'Асуултаа шалгаад дахин илгээнэ үү. Асуудал давтагдвал хуудсаа сэргээнэ үү.' }, 400)
    }
    console.error('[assistant]', err)
    return json({ error: 'Туслах түр ажиллахгүй байна. Дахин оролдоно уу.' }, 500)
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('c') ?? ''
  if (!z.guid().safeParse(id).success) return json({ error: 'Яриа олдсонгүй.' }, 404)
  const visitorKey = await readVisitorKey()
  if (!visitorKey) return json({ error: 'Яриа олдсонгүй.' }, 404)
  const ipHash = hashIp(clientIp(req))
  try {
    await enforceRateLimit(db, LIMITS.assistantPoll, ipHash ?? visitorKey)
  } catch {
    return json({ error: 'Хэт олон хүсэлт. Түр хүлээнэ үү.' }, 429)
  }
  const view = await pollConversation(db, id, { channel: 'website', visitorKey, ipHash })
  return view ? json(view) : json({ error: 'Яриа олдсонгүй.' }, 404)
}
