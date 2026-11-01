// Web addresses from Mongolian names: «Ноолууран свитер» → "nooluuran-sviter".
// Admins never have to invent Latin codes; the result can still be edited.

const MN_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(name: string, maxLength = 64): string {
  return [...name.toLowerCase()]
    .map((ch) => MN_TO_LATIN[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')
}

/** SKU fragment from a code or name: "Oversized hoodie" -> "OVERSIZED-HOODIE". */
export function skuPart(value: string, maxLength = 12): string {
  return slugify(value, 40).toUpperCase().replace(/-/g, '').slice(0, maxLength)
}
