// Messenger and Instagram show plain text: no Markdown links, no bold. The
// assistant writes for the storefront chat, so its replies are adjusted here
// before they are sent. Pure, so it is unit-tested without a database.

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** Storefront wording that points at a button the chat shows and Messenger does not. */
const WORDING: [RegExp, string][] = [[/Доорх товчоор/g, 'Доорх холбоосоор']]

/**
 * Turns an assistant reply into Messenger text.
 * - `[Name](/products/x)` becomes `Name: https://…/products/x`, or just `Name` when that page is
 *   already in `listed` (the product lines sent under the reply).
 * - A line that only points at listed pages ("Дэлгэрэнгүй: [Name](…)") is dropped.
 * - Emphasis asterisks are removed.
 */
export function toMessengerText(text: string, listed: ReadonlySet<string>, absolute: (href: string) => string): string {
  const abs = (href: string) => (/^https?:\/\//i.test(href) ? href : absolute(href))
  const lines = text.split('\n').flatMap((line) => {
    const links = [...line.matchAll(LINK)]
    if (links.length && links.every((m) => listed.has(abs(m[2])))) {
      const rest = line.replace(LINK, '').replace(/[\s,;:·•—-]+/g, '')
      if (rest.length <= 20) return []
    }
    return [line.replace(LINK, (_, label: string, href: string) => (listed.has(abs(href)) ? label : `${label}: ${abs(href)}`))]
  })
  let out = lines
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
  for (const [pattern, replacement] of WORDING) out = out.replace(pattern, replacement)
  return out.replace(/\n{3,}/g, '\n\n').trim()
}
