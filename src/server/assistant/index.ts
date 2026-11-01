// Entry point for the shopping assistant: validation, abuse limits, AI budget,
// mode selection and usage logging.
import { and, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { parsePriceLimits } from '@/lib/assistant-parse'
import { ServiceError } from '@/server/context'
import type { Database } from '@/server/db/client'
import * as t from '@/server/db/schema'
import { enforceRateLimit, LIMITS } from '@/server/security/rate-limit'
import { answerFromCatalog, type AssistantReply } from './engine'
import { amountsIn } from '@/lib/fact-check'
import { answerWithLlm, costMicroUsd } from './llm'
import { buildToolContext } from './tools'

export const assistantInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1200) }))
    .min(1)
    .max(16),
  pageSlug: z.string().regex(/^[a-z0-9-]{1,80}$/).nullish(),
  contextSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,80}$/)).max(6).optional(),
})

export function aiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY && process.env.ASSISTANT_AI !== 'off'
}

function dailyBudgetMicroUsd(): number {
  const usd = Number(process.env.AI_DAILY_BUDGET_USD ?? '1')
  return Math.max(0, Math.round((Number.isFinite(usd) ? usd : 1) * 1_000_000))
}

async function spentTodayMicroUsd(db: Database): Promise<number> {
  // Day boundary in Ulaanbaatar time (UTC+8).
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${t.aiUsage.costMicroUsd}), 0)::int` })
    .from(t.aiUsage)
    .where(and(gte(t.aiUsage.createdAt, sql`date_trunc('day', now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar'`)))
  return row?.total ?? 0
}

export async function answerAssistant(db: Database, raw: unknown, meta: { ipHash: string | null }): Promise<AssistantReply> {
  const input = assistantInput.parse(raw)
  const subject = meta.ipHash ?? 'anonymous'
  await enforceRateLimit(db, LIMITS.assistantBurst, subject)
  await enforceRateLimit(db, LIMITS.assistantDaily, subject)

  const last = input.messages[input.messages.length - 1]
  if (last.role !== 'user') throw new ServiceError('invalid', 'Асуултаа бичнэ үү.')
  const tc = await buildToolContext(db)

  if (aiConfigured() && (await spentTodayMicroUsd(db)) < dailyBudgetMicroUsd()) {
    const history = input.messages.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }))
    const limits = parsePriceLimits(last.content)
    const userAmounts = [...amountsIn(last.content), limits.maxPrice, limits.minPrice].filter((n): n is number => typeof n === 'number')
    try {
      const { reply, usage, problems } = await answerWithLlm(tc, history, { pageSlug: input.pageSlug ?? null, userAmounts })
      await db.insert(t.aiUsage).values({
        mode: 'llm',
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costMicroUsd: costMicroUsd(usage),
        toolCalls: usage.toolCalls,
        ok: !!reply,
        visitorHash: meta.ipHash,
      })
      if (reply) return reply
      console.warn('[assistant] AI reply failed the fact check; using catalogue mode', problems)
    } catch (err) {
      console.error('[assistant] AI error; using catalogue mode', err instanceof Error ? err.message : err)
    }
  }

  const reply = answerFromCatalog(tc, last.content, { slugs: input.contextSlugs ?? [], pageSlug: input.pageSlug ?? null })
  await db.insert(t.aiUsage).values({ mode: 'rules', ok: true, visitorHash: meta.ipHash })
  return reply
}
