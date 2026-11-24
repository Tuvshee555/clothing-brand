// Who may start the daily demo housekeeping (/api/cron/maintenance).
//
// With CRON_SECRET set, only "Authorization: Bearer <CRON_SECRET>" is accepted — what Vercel
// Cron sends. Without it the store still cleans up after itself: Vercel's scheduler is
// recognised by its own headers, and the route caps the job at one run per 20 hours
// (LIMITS.maintenance), so nobody can make it run more often than the schedule does. The job
// is idempotent housekeeping of visitor demo data (see services/maintenance.ts), so a caller
// imitating the scheduler can at most move that day's run earlier.
import { safeEqual } from './crypto'

export type CronAccess = 'secret' | 'scheduler' | 'denied'

export function cronAccess(headers: Headers, secret: string | undefined): CronAccess {
  if (secret) {
    if (secret.length < 16) return 'denied'
    return safeEqual(headers.get('authorization') ?? '', `Bearer ${secret}`) ? 'secret' : 'denied'
  }
  const fromScheduler = (headers.get('user-agent') ?? '').startsWith('vercel-cron/') || headers.has('x-vercel-cron-schedule')
  return fromScheduler ? 'scheduler' : 'denied'
}
