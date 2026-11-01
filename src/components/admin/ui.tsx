import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { AVAILABILITY_LABELS, type Availability } from '@/lib/catalog'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'

export function abtn(variant: BtnVariant = 'primary', size: 'sm' | 'md' = 'md', className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
    variant === 'primary' && 'bg-ink text-white hover:bg-charcoal',
    variant === 'secondary' && 'border border-stone-300 bg-white text-ink hover:border-stone-400 hover:bg-paper',
    variant === 'ghost' && 'text-charcoal hover:bg-paper-2',
    variant === 'subtle' && 'bg-paper-2 text-ink hover:bg-bone',
    variant === 'danger' && 'bg-danger text-white hover:bg-[#842424]',
    className,
  )
}

export function AButton({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ComponentProps<'button'> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return <button type={type} className={abtn(variant, size, className)} {...props} />
}

export const ainput =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-[13.5px] text-ink placeholder:text-stone-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink disabled:bg-paper-2 disabled:text-stone-600 aria-[invalid=true]:border-danger'

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-xl border border-stone-200 bg-white', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-5 py-3.5">
          {title && <h2 className="text-[14px] font-medium">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {back && (
          <Link href={back.href} className="mb-1 inline-block text-[12.5px] text-stone-600 hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[22px] font-medium tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warning' | 'danger' }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-[12px] text-stone-600">{label}</p>
      <p className={cn('tabular mt-1.5 text-[24px] font-medium tracking-tight', tone === 'warning' && 'text-warning', tone === 'danger' && 'text-danger')}>{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-stone-500">{hint}</p>}
    </div>
  )
}

const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap'

const STATUS_TONES: Record<OrderStatus, string> = {
  pending: 'bg-warning-soft text-warning',
  confirmed: 'bg-info-soft text-info',
  processing: 'bg-info-soft text-info',
  shipped: 'bg-[#ece7f6] text-[#4d3b7a]',
  delivered: 'bg-success-soft text-success',
  cancelled: 'bg-danger-soft text-danger',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn(pill, STATUS_TONES[status])}>{ORDER_STATUS_LABELS[status]}</span>
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = status === 'paid' ? 'bg-success-soft text-success' : status === 'simulated' ? 'bg-info-soft text-info' : status === 'refunded' ? 'bg-paper-2 text-charcoal' : 'bg-warning-soft text-warning'
  return <span className={cn(pill, tone)}>{PAYMENT_STATUS_LABELS[status]}</span>
}

export function StockBadge({ availability, stock }: { availability: Availability; stock?: number }) {
  const tone =
    availability === 'in_stock' ? 'bg-success-soft text-success' : availability === 'low_stock' ? 'bg-warning-soft text-warning' : availability === 'out_of_stock' ? 'bg-danger-soft text-danger' : 'bg-paper-2 text-stone-600'
  return (
    <span className={cn(pill, tone)}>
      {stock !== undefined && <span className="tabular">{stock}</span>}
      {AVAILABILITY_LABELS[availability]}
    </span>
  )
}

export function SampleTag() {
  return <span className={cn(pill, 'bg-paper-2 text-stone-600')}>Жишээ</span>
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap px-4 py-2.5 text-left text-[11.5px] font-medium uppercase tracking-wide text-stone-600', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle text-[13px]', className)}>{children}</td>
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse">{children}</table>
    </div>
  )
}

export function AEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-[13px] text-stone-600">{children}</div>}
    </div>
  )
}

export const dateTime = new Intl.DateTimeFormat('mn-MN', { timeZone: 'Asia/Ulaanbaatar', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const dateOnly = new Intl.DateTimeFormat('mn-MN', { timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: 'short', day: 'numeric' })
