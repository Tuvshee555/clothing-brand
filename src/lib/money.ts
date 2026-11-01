// Money is always an integer number of tögrög (MNT). Never use floats for amounts.

export const CURRENCY = 'MNT' as const
export const CURRENCY_SYMBOL = '₮'

/** Groups digits with commas: 1250000 -> "1,250,000". */
export function formatNumber(value: number): string {
  const negative = value < 0
  const grouped = Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}`
}

/** 125000 -> "125,000₮". */
export function formatMoney(amount: number, options: { showPlus?: boolean } = {}): string {
  const prefix = options.showPlus && amount > 0 ? '+' : ''
  return `${prefix}${formatNumber(amount)}${CURRENCY_SYMBOL}`
}

/** Parses user input like "125,000₮" or "125 000" into an integer, or null. */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[\s,₮]/g, '')
  if (!/^-?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isSafeInteger(n) ? n : null
}

/** Unit price of a variant: its own override, otherwise the product's base price. */
export function variantPrice(basePrice: number, priceOverride: number | null | undefined): number {
  return priceOverride ?? basePrice
}

/** Delivery fee after the free-delivery threshold is applied. */
export function shippingFeeFor(subtotal: number, method: { fee: number; freeThreshold: number | null }): number {
  return method.freeThreshold !== null && subtotal >= method.freeThreshold ? 0 : method.fee
}
