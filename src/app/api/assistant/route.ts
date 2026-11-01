// Shopping assistant endpoint. Same-origin JSON only, size-limited, rate
// limited per (hashed) IP, with a daily AI spending cap behind it.
import { z } from 'zod'
import { answerAssistant } from '@/server/assistant'
import { ServiceError } from '@/server/context'
import { db } from '@/server/db'
import { hashIp } from '@/server/security/crypto'

const MAX_BODY = 24_000

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin fetches from older browsers may omit it
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get('host')
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: 'Хүсэлт буруу байна.' }, { status: 403 })
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
    return Response.json({ error: 'Хүсэлт буруу байна.' }, { status: 415 })
  }
  const text = await req.text()
  if (text.length > MAX_BODY) return Response.json({ error: 'Мессеж хэт урт байна.' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ error: 'Хүсэлт буруу байна.' }, { status: 400 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip')
  try {
    const reply = await answerAssistant(db, body, { ipHash: hashIp(ip) })
    return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    if (err instanceof ServiceError) {
      const status = err.code === 'rate_limited' ? 429 : 400
      return Response.json({ error: err.message }, { status })
    }
    if (err instanceof z.ZodError) return Response.json({ error: 'Асуултаа шалгаад дахин илгээнэ үү.' }, { status: 400 })
    console.error('[assistant]', err)
    return Response.json({ error: 'Туслах түр ажиллахгүй байна. Дахин оролдоно уу.' }, { status: 500 })
  }
}
