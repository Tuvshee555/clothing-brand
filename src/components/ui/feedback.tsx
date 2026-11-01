import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const tones: Record<Tone, string> = {
  info: 'border-info/25 bg-info-soft text-info',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  neutral: 'border-stone-200 bg-paper-2 text-charcoal',
}

const icons: Record<Tone, ReactNode> = {
  info: <Info className="h-4 w-4" aria-hidden />,
  success: <CheckCircle2 className="h-4 w-4" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4" aria-hidden />,
  danger: <XCircle className="h-4 w-4" aria-hidden />,
  neutral: <Info className="h-4 w-4" aria-hidden />,
}

export function Alert({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 border px-4 py-3 text-sm', tones[tone], className)}>
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-[13.5px] leading-relaxed opacity-95">{children}</div>}
      </div>
    </div>
  )
}

const badgeTones: Record<Tone | 'accent' | 'ink', string> = {
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-paper-2 text-charcoal',
  accent: 'bg-accent-soft text-accent',
  ink: 'bg-ink text-white',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof badgeTones; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em]', badgeTones[tone], className)}>
      {children}
    </span>
  )
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-stone-300 px-6 py-14 text-center">
      <p className="display text-2xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-stone-600">{children}</div>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden />
}
