// Price limits in shopper questions ("200,000₮-өөс доош", "200 мянга хүртэл",
// "under 150k"). The rest of the understanding lives in server/assistant/understand.ts.

/** "200,000", "200 000", "200000", "200 мянга", "200k" → 200000 */
function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  // No \b here: JavaScript word boundaries are ASCII-only and never match after Cyrillic.
  // "мянга" may carry a case ending ("100 мянгаас"); "k" may not ("kg").
  const thousands = /(\d+(?:[.,]\d+)?)\s*(мянг\p{L}*|k(?![\p{L}])|к(?![\p{L}]))/u.exec(s)
  if (thousands) return Math.round(Number(thousands[1].replace(',', '.')) * 1000)
  const millions = /(\d+(?:[.,]\d+)?)\s*(сая\p{L}*|m(?![\p{L}]))/u.exec(s)
  if (millions) return Math.round(Number(millions[1].replace(',', '.')) * 1_000_000)
  const digits = s.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) && n >= 1000 ? n : null
}

const AMOUNT = String.raw`(\d[\d\s,.]*\d|\d)\s*(?:мянга|мянган|k|к|сая)?\s*(?:₮|төгрөг|tugrik|mnt)?`

export function parsePriceLimits(text: string): { maxPrice: number | null; minPrice: number | null } {
  const t = text.toLowerCase()
  let maxPrice: number | null = null
  let minPrice: number | null = null
  // "-аас" after a digit, "-ас" after "мянга" ("100 мянгаас").
  const below = new RegExp(`${AMOUNT}\\s*(?:-?(?:аас|ээс|оос|өөс|ас|эс|ос|өс|с))?\\s*(?:доош|бага|хүртэл|дотор|хямд)`, 'u').exec(t)
  const under = new RegExp(`(?:under|below|less than|max|хүртэл)\\s*${AMOUNT}`, 'u').exec(t)
  const above = new RegExp(`${AMOUNT}\\s*(?:-?(?:аас|ээс|оос|өөс|ас|эс|ос|өс|с))?\\s*(?:дээш|их|илүү)`, 'u').exec(t)
  const over = new RegExp(`(?:over|above|more than|min)\\s*${AMOUNT}`, 'u').exec(t)
  const pick = (m: RegExpExecArray | null) => (m ? parseAmount(m[0].replace(/(доош|бага|хүртэл|дотор|хямд|дээш|их|илүү|under|below|less than|max|over|above|more than|min)/g, '')) : null)
  maxPrice = pick(below) ?? pick(under)
  minPrice = pick(above) ?? pick(over)
  return { maxPrice, minPrice }
}
