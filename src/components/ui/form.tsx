import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export const inputClass =
  'block w-full border border-stone-300 bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-stone-500 ' +
  'transition-colors hover:border-stone-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ' +
  'disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-stone-600 aria-[invalid=true]:border-danger'

export function Field({
  id,
  label,
  hint,
  error,
  required,
  optional,
  className,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="ml-0.5 text-accent" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="ml-1.5 font-normal text-stone-600">(заавал биш)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[12.5px] text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-hint`} className="text-[12.5px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'min-h-24', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(inputClass, 'appearance-none bg-[length:12px] bg-[right_0.9rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: CHEVRON }} {...props}>
      {children}
    </select>
  )
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23161514' stroke-width='1.4'/%3E%3C/svg%3E\")"

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm text-ink', className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-ink" {...props} />
      <span>{label}</span>
    </label>
  )
}
