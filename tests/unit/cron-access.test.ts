import { describe, expect, it } from 'vitest'
import { cronAccess } from '@/server/security/cron'
import { LIMITS } from '@/server/security/rate-limit'

const SECRET = 'a-long-enough-cron-secret-value'
const h = (init: Record<string, string>) => new Headers(init)

describe('who may run the daily maintenance', () => {
  it('with CRON_SECRET set, accepts only the matching bearer', () => {
    expect(cronAccess(h({ authorization: `Bearer ${SECRET}` }), SECRET)).toBe('secret')
    expect(cronAccess(h({ authorization: 'Bearer wrong' }), SECRET)).toBe('denied')
    // The scheduler's headers alone are not enough once a secret exists.
    expect(cronAccess(h({ 'user-agent': 'vercel-cron/1.0' }), SECRET)).toBe('denied')
  })

  it('refuses a secret too short to be one', () => {
    expect(cronAccess(h({ authorization: 'Bearer short' }), 'short')).toBe('denied')
  })

  it('without CRON_SECRET, recognises Vercel Cron and nobody else', () => {
    expect(cronAccess(h({ 'user-agent': 'vercel-cron/1.0' }), undefined)).toBe('scheduler')
    expect(cronAccess(h({ 'x-vercel-cron-schedule': '0 19 * * *' }), undefined)).toBe('scheduler')
    expect(cronAccess(h({ 'user-agent': 'Mozilla/5.0' }), undefined)).toBe('denied')
    expect(cronAccess(h({}), '')).toBe('denied')
  })

  it('lets the scheduler path run the job once per 20 hours at most', () => {
    expect(LIMITS.maintenance.limit).toBe(1)
    expect(LIMITS.maintenance.windowSeconds).toBe(20 * 60 * 60)
  })
})
