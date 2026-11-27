import { Check } from 'lucide-react'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders'
import { cn } from '@/lib/cn'

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

/**
 * Order steps, named on every screen. A fifth of a phone's width is narrower than
 * «Баталгаажсан», so on a phone the steps are a vertical list (dot, line, name); from `sm`
 * they are a row of bars with the names under them.
 */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return <p className="border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">Захиалга цуцлагдсан. Нөөцөлсөн бараа агуулахад буцсан.</p>
  }
  const current = STEPS.indexOf(status)
  return (
    <ol className="grid sm:grid-cols-5 sm:gap-1" aria-label="Захиалгын явц">
      {STEPS.map((step, i) => {
        const done = i < current
        const now = i === current
        return (
          <li
            key={step}
            aria-current={now ? 'step' : undefined}
            className={cn(
              'relative flex items-start gap-3 pb-3 last:pb-0 sm:flex-col sm:items-stretch sm:gap-2 sm:pb-0',
              // Phone: the line joining one dot to the next.
              'before:absolute before:left-[9px] before:top-[19px] before:h-[calc(100%-19px)] before:w-px last:before:hidden sm:before:hidden',
              done ? 'before:bg-ink' : 'before:bg-stone-300',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'relative grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border sm:hidden',
                done ? 'border-ink bg-ink text-white' : now ? 'border-ink bg-paper' : 'border-stone-300 bg-paper',
              )}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : now ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
            </span>
            <span aria-hidden className={cn('hidden h-1 sm:block', i <= current ? 'bg-ink' : 'bg-stone-200')} />
            <span className={cn('flex items-center gap-1 text-[13.5px] leading-[19px] sm:text-[11.5px] sm:leading-tight', i <= current ? 'text-ink' : 'text-stone-500', now && 'font-medium')}>
              {done && <Check className="hidden h-3 w-3 shrink-0 sm:block" aria-hidden />}
              {ORDER_STATUS_LABELS[step]}
              {now && <span className="font-normal text-stone-500 sm:hidden">· одоо</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
