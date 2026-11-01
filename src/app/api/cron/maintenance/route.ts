// Daily demo housekeeping. Vercel Cron calls this with
// "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
import { connection } from 'next/server'
import { db } from '@/server/db'
import { safeEqual } from '@/server/security/crypto'
import { runDemoMaintenance } from '@/server/services/maintenance'

export async function GET(req: Request) {
  await connection()
  const secret = process.env.CRON_SECRET
  const given = req.headers.get('authorization') ?? ''
  if (!secret || secret.length < 16 || !safeEqual(given, `Bearer ${secret}`)) {
    return new Response('Unauthorized', { status: 401 })
  }
  const report = await runDemoMaintenance({ db, actor: null, now: new Date() })
  console.info('[maintenance]', JSON.stringify(report))
  return Response.json({ ok: true, ...report }, { headers: { 'Cache-Control': 'no-store' } })
}
