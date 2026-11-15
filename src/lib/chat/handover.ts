// Hand-over vocabulary and rules of the chat engine (Lorentz handler.ts /
// types.ts at 69e4110). A hand-over only flags the conversation for staff;
// the assistant keeps answering until a person takes the chat over. Only a
// takeover pauses it, and staff hand it back explicitly (or it returns on its
// own after the owner's silence limit).

export const HANDOFF_REASONS = [
  'customer_request',
  'complaint',
  'payment_claim',
  'order_problem',
  'bulk_order',
  'size_advice',
  'unanswered',
  'ai_error',
] as const
export type HandoffReason = (typeof HANDOFF_REASONS)[number]

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  customer_request: 'Хүн хүссэн',
  complaint: 'Гомдол',
  payment_claim: 'Төлбөр төлсөн гэсэн',
  order_problem: 'Захиалгын асуудал',
  bulk_order: 'Их тоогоор авах',
  size_advice: 'Хэмжээний зөвлөгөө',
  unanswered: 'Хариулж чадаагүй',
  ai_error: 'Системийн алдаа',
}

export type HandoverStatus = 'open' | 'taken' | 'resolved'

export const HANDOVER_STATUS_LABELS: Record<HandoverStatus, string> = {
  open: 'Хүлээж буй',
  taken: 'Ажилтан хариулж буй',
  resolved: 'Шийдэгдсэн',
}

export function isHandoffReason(value: unknown): value is HandoffReason {
  return typeof value === 'string' && (HANDOFF_REASONS as readonly string[]).includes(value)
}

/**
 * Should a conversation a person took over go back to the assistant on its own?
 * Only when the person's last reply (or the takeover itself) is older than the
 * owner's limit; 0 hours means never. Lorentz lesson: a pause that never ended
 * left customers unanswered for days.
 */
export function shouldAutoResume(input: { paused: boolean; hours: number; lastHumanAt?: Date | null; takenOverAt?: Date | null; now?: Date }): boolean {
  if (!input.paused || !(input.hours > 0)) return false
  const reference = input.lastHumanAt?.getTime() ?? input.takenOverAt?.getTime()
  if (reference === undefined || !Number.isFinite(reference)) return false
  return (input.now ?? new Date()).getTime() - reference > input.hours * 3_600_000
}

/** What staff need to act without reading the whole chat (stored on the hand-over). */
export interface HandoverContext {
  products: { slug: string; name: string }[]
  /** The colour / size the customer settled on, if any. */
  variant: { product: string; color: string | null; size: string | null } | null
  purchaseIntent: boolean
  /** The chat order draft step, when one was in progress. */
  draftStep: string | null
  lastMessages: string[]
}
