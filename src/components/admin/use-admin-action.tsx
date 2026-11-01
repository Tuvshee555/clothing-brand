'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/cn'

type Result = { ok: true; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Runs a server action from an admin form: pending state and Mongolian error/success text. */
export function useAdminAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const run = (fn: () => Promise<Result>, success?: string, after?: (data: unknown) => void) =>
    start(async () => {
      setError(null)
      setFieldErrors({})
      setMessage(null)
      const res = await fn()
      if (!res.ok) {
        setError(res.error)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      if (success) setMessage(success)
      after?.(res.data)
    })
  return { pending, error, fieldErrors, message, run, setError, setMessage }
}

export function ActionFeedback({ error, message, className }: { error: string | null; message?: string | null; className?: string }) {
  if (!error && !message) return null
  return (
    <p role={error ? 'alert' : 'status'} className={cn('rounded-lg px-3 py-2 text-[13px]', error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success', className)}>
      {error ?? message}
    </p>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-[12px] font-medium text-danger">{message}</p>
}
