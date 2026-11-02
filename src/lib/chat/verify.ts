// The fact check every model-written reply passes before a customer sees it
// (Lorentz productReplyVerification.ts at 69e4110, generalised). Free wording
// is allowed, but every checkable fact must come from the evidence this turn
// produced: amounts, stock counts, links, phone numbers and e-mails. Claims the
// assistant may never make — a payment received, an order created, a discount —
// are rejected outright. An empty list means the reply passes.
import { amountsIn, stockCountsIn } from '@/lib/fact-check'

export interface Evidence {
  /** Amounts the reply may mention (this turn's tool results and the customer's own numbers). */
  amounts: Set<number>
  /** Stock counts returned by an exact stock lookup this turn. */
  stockCounts: Set<number>
  /** Internal paths the reply may link to. */
  allowedPath: (path: string) => boolean
  emails: Set<string>
  phones: Set<string>
}

const CLAIMS: [RegExp, string][] = [
  [/(?:төлбөр\S*\s+(?:нь\s+)?(?:орсон|төлөгдсөн|баталгаажсан|хүлээн\s+авлаа|амжилттай)|payment\s+(?:is\s+|was\s+|has\s+been\s+)?(?:received|confirmed|successful))/iu, 'payment_claim'],
  [/(?:захиалга\S*\s+(?:тань\s+|чинь\s+)?(?:үүслээ|үүсгэлээ|бүртгэгдлээ|баталгаажлаа|хийгдлээ)|order\s+(?:has\s+been\s+|was\s+|is\s+)?(?:placed|created|confirmed))/iu, 'order_claim'],
  [/\d+\s*%/u, 'percent_claim'],
]

export function verifyReply(text: string, evidence: Evidence): string[] {
  const problems: string[] = []
  for (const amount of amountsIn(text)) if (!evidence.amounts.has(amount)) problems.push(`amount ${amount} is not in the evidence`)
  for (const count of stockCountsIn(text)) if (!evidence.stockCounts.has(count)) problems.push(`stock count ${count} was not returned by a stock lookup`)
  for (const m of text.matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) {
    const target = m[1]
    if (/^https?:/i.test(target) || target.startsWith('//')) problems.push(`external link ${target.slice(0, 60)}`)
    else if (!evidence.allowedPath(target.split(/[?#]/)[0])) problems.push(`link ${target.slice(0, 60)} does not exist`)
  }
  for (const m of text.replace(/\]\([^)]*\)/g, ']').matchAll(/https?:\/\/[^\s)]+/gi)) problems.push(`external link ${m[0].slice(0, 60)}`)
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) if (!evidence.emails.has(m[0].replace(/\.+$/, '').toLowerCase())) problems.push('unknown e-mail')
  for (const m of text.matchAll(/(?<![\d-])(?:\+?976[ -]?)?(\d{4}[ -]?\d{4})(?![\d-])/g)) {
    if (!evidence.phones.has(m[1].replace(/\D/g, ''))) problems.push('unknown phone number')
  }
  for (const [pattern, code] of CLAIMS) if (pattern.test(text)) problems.push(code)
  return problems
}
