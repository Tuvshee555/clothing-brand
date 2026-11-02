// Clothing-specific fact check for model-written replies: a line that names a
// product together with one colour and one size, and claims that variant is in
// stock, sold out, or has N pieces, must match that exact variant in the
// database. This is what keeps a model from confusing black with grey, M with
// L, or product stock with variant stock.
import { matchColors, normShopper, parseSizes } from '@/lib/assistant/fashion'
import { normalizeText, type CatalogProduct } from '@/lib/catalog-filter'

const AVAILABLE = /(?:^|\s)(?:байна|байгаа|бэлэн|үлдсэн|available|in\s+stock)(?=\s|$|[.,!:;])/iu
const SOLD_OUT = /(?:дууссан|байхгүй|үлдээгүй|sold\s+out|out\s+of\s+stock)/iu
const COUNT = /(\d{1,4})\s*(?:ширхэг|ш\b)/iu

export function variantClaimProblems(reply: string, catalog: CatalogProduct[]): string[] {
  const problems: string[] = []
  const names = catalog.map((p) => ({ p, n: normalizeText(p.name) })).sort((a, b) => b.n.length - a.n.length)
  let current: CatalogProduct | null = null
  for (const rawLine of reply.split(/\n/)) {
    const line = rawLine.replace(/\]\([^)]*\)/g, ']')
    const norm = normShopper(line)
    const named = names.filter(({ n }) => ` ${normalizeText(line)} `.includes(` ${n} `))
    // A line naming one product sets it; bullets under it ("- Хар / L: 4 ширхэг") inherit it.
    if (named.length === 1) current = named[0].p
    else if (named.length > 1 || !/^\s*[-•*]/.test(rawLine)) current = null
    if (!current) continue
    const p = current
    const colors = matchColors(norm, p.colors)
    const sizes = parseSizes(line, norm)
    const claimsAvailable = AVAILABLE.test(norm) && !SOLD_OUT.test(norm)
    const claimsSoldOut = SOLD_OUT.test(norm)
    if (colors.colors.length === 0 && colors.asked.length > 0 && claimsAvailable && !SOLD_OUT.test(norm)) {
      problems.push(`${p.slug}: claims colour «${colors.asked.map((a) => a.phrase).join(', ')}» which the product does not come in`)
      continue
    }
    if (colors.colors.length !== 1 || sizes.length !== 1) continue
    const variant = p.variants.find((v) => v.colorId === colors.colors[0].id && v.size === sizes[0])
    const label = `${p.slug} ${colors.colors[0].name}/${sizes[0]}`
    if (!variant) {
      if (claimsAvailable) problems.push(`${label} does not exist`)
      continue
    }
    const inStock = variant.isActive && variant.stock > 0
    if (claimsAvailable && !inStock) problems.push(`${label} is sold out but the reply says available`)
    if (claimsSoldOut && inStock && !claimsAvailable) problems.push(`${label} is in stock but the reply says sold out`)
    const count = COUNT.exec(norm)
    if (count && Number(count[1]) !== variant.stock) problems.push(`${label} has ${variant.stock}, the reply says ${count[1]}`)
  }
  return problems
}
