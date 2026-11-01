// Pure helpers for checking an assistant reply against database facts.

/** Money amounts written in a reply: "219,000₮", "219 000 төгрөг", "219 мянга". */
export function amountsIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(\d{1,3}(?:[,\s.]\d{3})+|\d{4,})\s*(?:₮|төгрөг|tögrög|mnt)/giu)) out.push(Number(m[1].replace(/[,\s.]/g, '')))
  for (const m of text.matchAll(/(\d{1,4})\s*мянга/giu)) out.push(Number(m[1]) * 1000)
  return out
}

/** Stock counts written in a reply: "4 ширхэг". */
export function stockCountsIn(text: string): number[] {
  return [...text.matchAll(/(\d{1,4})\s*ширхэг/giu)].map((m) => Number(m[1]))
}
