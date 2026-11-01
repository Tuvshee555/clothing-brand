'use client'

import { useState, useTransition } from 'react'
import { subscribeNewsletterAction } from '@/server/actions/store'

export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const res = await subscribeNewsletterAction(email)
          if (!res.ok) setMessage({ ok: false, text: res.error })
          else {
            setMessage({
              ok: true,
              text: res.data.already ? 'Та аль хэдийн бүртгүүлсэн байна.' : 'Бүртгэгдлээ. (Демо: и-мэйл илгээгдэхгүй.)',
            })
            setEmail('')
          }
        })
      }}
      className="space-y-2"
    >
      <div className="flex border-b border-white/30 focus-within:border-white">
        <label htmlFor="newsletter-email" className="sr-only">
          И-мэйл хаяг
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="И-мэйл хаяг"
          className="h-11 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
          autoComplete="email"
        />
        <button type="submit" disabled={pending} className="eyebrow px-2 text-white/85 hover:text-white disabled:opacity-50">
          {pending ? '…' : 'Бүртгүүлэх'}
        </button>
      </div>
      <p className={message ? (message.ok ? 'text-xs text-white/75' : 'text-xs text-[#f0a9a0]') : 'text-xs text-white/45'} role="status">
        {message?.text ?? 'Шинэ цуглуулга, онцгой урилгыг хамгийн түрүүнд.'}
      </p>
    </form>
  )
}
