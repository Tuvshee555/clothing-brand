import { Check } from 'lucide-react'
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/orders'
import { cn } from '@/lib/cn'

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered']

export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return <p className="border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger">Захиалга цуцлагдсан. Нөөцөлсөн бараа агуулахад буцсан.</p>
  }
  const current = STEPS.indexOf(status)
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label="Захиалгын явц">
      {STEPS.map((step, i) => {
        const done = i <= current
        return (
          <li key={step} className="flex flex-col gap-2" aria-current={i === current ? 'step' : undefined}>
            <span className={cn('h-1', done ? 'bg-ink' : 'bg-stone-200')} />
            <span className={cn('flex items-center gap-1 text-[11.5px] leading-tight', done ? 'text-ink' : 'text-stone-500')}>
              {i < current && <Check className="h-3 w-3 shrink-0" />}
              {ORDER_STATUS_LABELS[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
