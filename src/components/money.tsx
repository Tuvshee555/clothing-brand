import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/cn'

export function Money({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn('tabular whitespace-nowrap', className)}>{formatMoney(amount)}</span>
}

/** "89,000₮" or "89,000–119,000₮" when variants are priced differently. */
export function PriceRange({ min, max, className }: { min: number; max: number; className?: string }) {
  if (min === max) return <Money amount={min} className={className} />
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      {formatMoney(min).replace('₮', '')}–{formatMoney(max)}
    </span>
  )
}
