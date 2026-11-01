'use client'

import { useState, useTransition } from 'react'
import { enterDemoAction, loginAction } from '@/server/actions/auth'
import { abtn, ainput } from './ui'

export function DemoEnterButton({ next }: { next?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={abtn('primary', 'md', 'w-full')}
        onClick={() =>
          start(async () => {
            const res = await enterDemoAction(next)
            if (res && !res.ok) setError(res.error)
          })
        }
      >
        {pending ? 'Нээж байна…' : 'Демо горимоор нэвтрэх'}
      </button>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </>
  )
}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const res = await loginAction({ email, password, next })
          if (res && !res.ok) setError(res.error)
        })
      }}
    >
      <div>
        <label htmlFor="login-email" className="mb-1 block text-[12.5px] font-medium">
          И-мэйл
        </label>
        <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={ainput} />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-[12.5px] font-medium">
          Нууц үг
        </label>
        <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={ainput} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={abtn('secondary', 'md', 'w-full')}>
        {pending ? 'Шалгаж байна…' : 'Нэвтрэх'}
      </button>
    </form>
  )
}
