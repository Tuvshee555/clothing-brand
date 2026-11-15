// Deterministic matching of the owner's own questions and answers (Lorentz
// knowledge.ts at 69e4110). A match quotes the stored answer verbatim — the
// model never rewrites it.
import { phoneticLatinText, phoneticTokenMatches, unique, type Alias } from './text'

export interface FaqItem {
  question: string
  answer: string
}

/** Question words that say nothing about the topic. */
const QUESTION_WORDS = new Set(
  ['вэ', 'бэ', 'уу', 'үү', 'юу', 'юм', 'нь', 'ямар', 'яаж', 'хэрхэн', 'байна', 'байгаа', 'байдаг', 'болох', 'боломжтой', 'танай', 'манай', 'энэ', 'тэр', 'би', 'бид', 'хэд', 'хэзээ', 'хаана', 'do', 'you', 'can', 'is', 'the', 'what', 'how', 'when', 'where'].map((w) => phoneticLatinText(w)),
)

function tokens(text: string, aliases: readonly Alias[]): string[] {
  return unique(
    phoneticLatinText(text, aliases)
      .split(' ')
      .filter((w) => w.length >= 3 && !QUESTION_WORDS.has(w)),
  )
}

/**
 * The best stored question for this message, or null. A short stored question
 * needs every content word; a longer one most of them and at least two.
 */
export function matchFaq<T extends FaqItem>(message: string, items: T[], aliases: readonly Alias[] = []): T | null {
  const asked = tokens(message, aliases)
  let best: { item: T; score: number; shared: number } | null = null
  for (const item of items) {
    const stored = tokens(item.question, aliases)
    if (!stored.length) continue
    const shared = stored.filter((s) => asked.some((a) => phoneticTokenMatches(a, s))).length
    const score = shared / stored.length
    const accepted = stored.length <= 2 ? score >= 1 : shared >= 2 && score >= 0.6
    if (!accepted) continue
    if (!best || score > best.score || (score === best.score && shared > best.shared)) best = { item, score, shared }
  }
  return best?.item ?? null
}
