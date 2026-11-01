// Fixed-window rate limiting stored in Postgres, so limits hold across
// serverless instances.
import { sql } from 'drizzle-orm'
import { ERR } from '@/server/context'
import type { Database } from '@/server/db/client'

export interface RateLimitRule {
  name: string
  limit: number
  windowSeconds: number
}

export const LIMITS = {
  login: { name: 'login', limit: 8, windowSeconds: 15 * 60 },
  demoLogin: { name: 'demo-login', limit: 20, windowSeconds: 60 * 60 },
  cart: { name: 'cart', limit: 90, windowSeconds: 60 },
  checkout: { name: 'checkout', limit: 8, windowSeconds: 60 * 60 },
  payment: { name: 'payment', limit: 20, windowSeconds: 10 * 60 },
  newsletter: { name: 'newsletter', limit: 5, windowSeconds: 60 * 60 },
  assistantBurst: { name: 'assistant-burst', limit: 12, windowSeconds: 5 * 60 },
  assistantDaily: { name: 'assistant-daily', limit: 60, windowSeconds: 24 * 60 * 60 },
  adminWrite: { name: 'admin-write', limit: 240, windowSeconds: 60 * 60 },
  upload: { name: 'upload', limit: 40, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>

/** `next dev` serves everything from one localhost IP, so limits are 20× looser there unless RATE_LIMITS=strict. */
function effectiveLimit(rule: RateLimitRule): number {
  return process.env.NODE_ENV === 'development' && process.env.RATE_LIMITS !== 'strict' ? rule.limit * 20 : rule.limit
}

export async function hitRateLimit(db: Database, rule: RateLimitRule, subject: string): Promise<boolean> {
  const key = `${rule.name}:${subject}`.slice(0, 200)
  const result = await db.execute<{ count: number }>(sql`
    insert into store.rate_limits (key, count, window_started_at)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when store.rate_limits.window_started_at < now() - make_interval(secs => ${rule.windowSeconds}) then 1
        else store.rate_limits.count + 1
      end,
      window_started_at = case
        when store.rate_limits.window_started_at < now() - make_interval(secs => ${rule.windowSeconds}) then now()
        else store.rate_limits.window_started_at
      end
    returning count
  `)
  return (result.rows[0]?.count ?? 0) <= effectiveLimit(rule)
}

/** Throws a Mongolian "too many attempts" error when the limit is exceeded. */
export async function enforceRateLimit(db: Database, rule: RateLimitRule, subject: string | null | undefined) {
  if (!(await hitRateLimit(db, rule, subject || 'anonymous'))) throw ERR.rateLimited()
}

export async function pruneRateLimits(db: Database) {
  await db.execute(sql`delete from store.rate_limits where window_started_at < now() - interval '2 days'`)
}
