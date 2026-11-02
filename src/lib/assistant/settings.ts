// The owner's chatbot settings (database `settings` row "assistant"). Isomorphic:
// the engine reads them, the admin edits them. Missing or malformed values fall
// back to these defaults, so the assistant works before the row exists.
import { z } from 'zod'
import { SELECTABLE_MODELS } from '@/lib/chat/models'
import { DEFAULT_MAX_ACTIVE_ORDERS, DEFAULT_MAX_QUANTITY_PER_ITEM, DEFAULT_RESERVATION_MINUTES } from '@/lib/chat/reservation'

export interface AssistantSettings {
  /** Master switch: off = the widget says the assistant is resting and offers the contact line. */
  enabled: boolean
  /** The owner may keep the rules-only catalogue mode even when an OpenAI key is configured. */
  aiEnabled: boolean
  /** "" = server default (OPENAI_MODEL_ASSISTANT if it has a known price, else gpt-4.1-mini). */
  aiModel: (typeof SELECTABLE_MODELS)[number]
  /** Estimated daily AI spend in USD; over it the assistant answers from rules. 0 = AI off. */
  aiDailyBudgetUsd: number
  /** The assistant may take a confirmed order in the chat (QPay, simulated in the demo). */
  chatOrdersEnabled: boolean
  reservationMinutes: number
  maxActiveOrders: number
  maxQuantityPerItem: number
  /** A chat a person took over returns to the assistant after this many silent hours (0 = never). */
  handoverAutoResumeHours: number
  /** Show exact counts ("4 ширхэг") or only "бэлэн / цөөн үлдсэн / дууссан". */
  showExactStock: boolean
  greeting: string
}

function envBudget(): number {
  const n = Number(process.env.AI_DAILY_BUDGET_USD ?? '1')
  return Number.isFinite(n) && n >= 0 ? n : 1
}

export function defaultAssistantSettings(): AssistantSettings {
  return {
    enabled: true,
    aiEnabled: true,
    aiModel: 'gpt-4.1-mini',
    aiDailyBudgetUsd: envBudget(),
    chatOrdersEnabled: true,
    reservationMinutes: DEFAULT_RESERVATION_MINUTES,
    maxActiveOrders: DEFAULT_MAX_ACTIVE_ORDERS,
    maxQuantityPerItem: DEFAULT_MAX_QUANTITY_PER_ITEM,
    handoverAutoResumeHours: 24,
    showExactStock: true,
    greeting: 'Сайн байна уу! Бараа, өнгө, хэмжээ, үлдэгдэл, хүргэлт, буцаалтын талаар асуугаарай — дэлгүүрийн сангаас шалгаж хариулна.',
  }
}

const int = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}: тоо оруулна уу.` })
    .int({ error: `${label}: бүхэл тоо оруулна уу.` })
    .min(min, { error: `${label}: хамгийн багадаа ${min}.` })
    .max(max, { error: `${label}: хамгийн ихдээ ${max}.` })

export const assistantSettingsInput = z.object({
  enabled: z.boolean(),
  aiEnabled: z.boolean(),
  aiModel: z.enum(SELECTABLE_MODELS, { error: 'Загварыг жагсаалтаас сонгоно уу.' }),
  aiDailyBudgetUsd: z
    .number({ error: 'Өдрийн төсөв: тоо оруулна уу.' })
    .min(0, { error: 'Өдрийн төсөв сөрөг байж болохгүй.' })
    .max(50, { error: 'Өдрийн төсөв хамгийн ихдээ $50.' }),
  chatOrdersEnabled: z.boolean(),
  reservationMinutes: int(5, 1440, 'Нөөцлөх хугацаа'),
  maxActiveOrders: int(1, 10, 'Төлөгдөөгүй захиалгын тоо'),
  maxQuantityPerItem: int(1, 20, 'Нэг бараанаас авах тоо'),
  handoverAutoResumeHours: int(0, 168, 'Туслах руу буцаах хугацаа'),
  showExactStock: z.boolean(),
  greeting: z.string().trim().min(5, { error: 'Мэндчилгээ хэт богино байна.' }).max(300, { error: 'Мэндчилгээ хэт урт байна.' }),
})

/** Stored value → complete settings (unknown or invalid fields fall back to the defaults). */
export function parseAssistantSettings(value: unknown): AssistantSettings {
  const defaults = defaultAssistantSettings()
  if (!value || typeof value !== 'object') return defaults
  const merged = { ...defaults, ...(value as Record<string, unknown>) }
  const parsed = assistantSettingsInput.safeParse(merged)
  if (parsed.success) return parsed.data
  // Keep whatever fields are valid one by one.
  const out = { ...defaults } as Record<string, unknown>
  for (const key of Object.keys(defaults) as (keyof AssistantSettings)[]) {
    const field = assistantSettingsInput.shape[key].safeParse((value as Record<string, unknown>)[key])
    if (field.success) out[key] = field.data
  }
  return out as unknown as AssistantSettings
}
