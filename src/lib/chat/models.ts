// Model routing and spend estimates of the chat engine (Lorentz aiUsage.ts at
// 69e4110). The owner picks a model from an allow-list in the admin; otherwise
// the deployment's OPENAI_MODEL_ASSISTANT is used when it is a model with a known
// price; otherwise the approved default. A premium model is only ever reached
// through one of those two explicit choices.

import { formatMoney } from '@/lib/money'

/** USD per million tokens [input, output]: an estimate for budgeting, never a bill. */
export const PRICE_PER_MILLION_USD: Record<string, [number, number]> = {
  'gpt-4.1': [2, 8],
  'gpt-4.1-mini': [0.4, 1.6],
  'gpt-4.1-nano': [0.1, 0.4],
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
}

/**
 * Models the owner may pick; "" means the server default. gpt-5-mini stays out:
 * in Lorentz's comparison its reasoning tokens used up the output budget and most
 * calls came back empty.
 */
export const SELECTABLE_MODELS = ['', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'] as const

/** Lorentz's approved production default: same held-out accuracy as gpt-4.1 at about a fifth of the cost. */
export const DEFAULT_AI_MODEL = 'gpt-4.1-mini'

/** What the owner chooses between, in plain words; the model ids stay on the server. */
export const MODEL_LABELS: Record<string, string> = {
  '': 'Үндсэн тохиргоо',
  'gpt-4.1-mini': 'Хэмнэлттэй (санал болгосон)',
  'gpt-4.1': 'Илүү нарийн (үнэтэй)',
  'gpt-4o-mini': 'Хамгийн хямд (сул)',
}

/** The plain-word level for a model the server resolved (dated ids included). */
export function aiLevelLabel(model: string): string {
  return MODEL_LABELS[model] ?? MODEL_LABELS[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')] ?? 'Тусгай тохиргоо'
}

/**
 * AI spend is tracked in US dollars (the AI service bills in dollars); owners see an
 * approximate tögrög figure. This rate is for display only — an estimate, never a bill.
 */
export const MNT_PER_USD = 3_500
export const usdToMnt = (usd: number) => Math.round(usd * MNT_PER_USD)
export const mntToUsd = (mnt: number) => mnt / MNT_PER_USD

/** «≈ 1,250₮»; below one tögrög «1₮-өөс бага». */
export function formatAiCost(usd: number): string {
  if (!(usd > 0)) return '0₮'
  const mnt = usd * MNT_PER_USD
  return mnt < 1 ? '1₮-өөс бага' : `≈ ${formatMoney(Math.round(mnt))}`
}

export function knownModel(model: string): boolean {
  return model in PRICE_PER_MILLION_USD || model.replace(/-\d{4}-\d{2}-\d{2}$/, '') in PRICE_PER_MILLION_USD
}

export function resolveAiModel(settingModel: string | null | undefined, envModel = process.env.OPENAI_MODEL_ASSISTANT): string {
  if (settingModel && (SELECTABLE_MODELS as readonly string[]).includes(settingModel)) return settingModel
  const fromEnv = (envModel || '').trim()
  if (fromEnv && knownModel(fromEnv)) return fromEnv
  return DEFAULT_AI_MODEL
}

/** Estimated cost in millionths of a dollar; unknown models use a conservative rate. */
export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const [inRate, outRate] = PRICE_PER_MILLION_USD[model] ?? PRICE_PER_MILLION_USD[model.replace(/-\d{4}-\d{2}-\d{2}$/, '')] ?? [2.5, 10]
  return Math.ceil(inputTokens * inRate + outputTokens * outRate)
}

/** Is the model allowed given today's spend and the owner's daily budget? A budget of 0 turns AI off. */
export function withinBudget(spentMicroUsd: number, budgetUsd: number): boolean {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) return false
  return spentMicroUsd < Math.round(budgetUsd * 1_000_000)
}
