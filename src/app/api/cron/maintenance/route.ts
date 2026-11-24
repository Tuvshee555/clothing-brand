// Daily demo housekeeping (Vercel Cron, see vercel.json). Who may call it is decided in
// server/security/cron.ts: the CRON_SECRET bearer when that variable is set, otherwise
// Vercel's scheduler at most once per 20 hours — so the store keeps itself tidy with no
// secret to configure.
import { connection } from 'next/server'
import { db } from '@/server/db'
import { cronAccess } from '@/server/security/cron'
import { hitRateLimit, LIMITS } from '@/server/security/rate-limit'
import { runDemoMaintenance } from '@/server/services/maintenance'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(req: Request) {
  await connection()
  const access = cronAccess(req.headers, process.env.CRON_SECRET)
  if (access === 'denied') return new Response('Unauthorized', { status: 401 })
  if (access === 'scheduler' && !(await hitRateLimit(db, LIMITS.maintenance, 'scheduler'))) {
    return Response.json({ ok: true, skipped: 'already ran in the last 20 hours' }, { headers: NO_STORE })
  }
  const report = await runDemoMaintenance({ db, actor: null, now: new Date() })
  console.info('[maintenance]', JSON.stringify(report))
  return Response.json({ ok: true, ...report }, { headers: NO_STORE })
}
