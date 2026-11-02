'use client'

import { ArrowUp, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { ChatThread } from '@/components/store/assistant-widget'
import type { ChatView, PublicChatMessage } from '@/lib/assistant/types'
import { resetTestChatAction, sendTestMessageAction } from '@/server/actions/assistant'
import { AButton, ainput } from '../ui'

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/**
 * The admin's "try the chatbot": the same engine and database as the
 * storefront, but orders are simulated (nothing is created, no stock moves) and
 * the cart is never touched.
 */
export function TestChat({ initial }: { initial: ChatView | null }) {
  const [view, setView] = useState<ChatView | null>(initial)
  const [messages, setMessages] = useState<PublicChatMessage[]>(initial?.messages ?? [])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || pending) return
    setInput('')
    setError(null)
    setPending(true)
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'customer', text, createdAt: new Date().toISOString() }])
    const res = await sendTestMessageAction({ conversationId: view?.conversationId ?? null, clientMessageId: newId(), text })
    setPending(false)
    if (res.ok) {
      setView(res.data)
      setMessages(res.data.messages)
    } else setError(res.error)
  }

  return (
    <div className="flex h-[min(680px,75dvh)] flex-col overflow-hidden rounded-xl border border-stone-200 bg-paper">
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-2.5">
        <p className="text-[12.5px] text-stone-600">Туршилтын чат · захиалга үүсэхгүй, үлдэгдэл өөрчлөгдөхгүй</p>
        <AButton
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={async () => {
            await resetTestChatAction()
            setView(null)
            setMessages([])
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Шинээр эхлэх
        </AButton>
      </div>
      <ChatThread view={view} messages={messages} pending={pending} onSend={send} onAction={() => setError('Туршилтын чатаас сагсанд нэмэхгүй — дэлгүүрийн туслахаас туршина уу.')} />
      <form
        className="border-t border-stone-200 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        {error && (
          <p role="alert" className="mb-2 text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <label htmlFor="test-input" className="sr-only">
            Туршилтын асуулт
          </label>
          <input id="test-input" className={ainput} value={input} maxLength={1200} onChange={(e) => setInput(e.target.value)} placeholder="Жишээ: har hoodie L bga yu" />
          <AButton type="submit" disabled={pending || !input.trim()} aria-label="Илгээх">
            <ArrowUp className="h-4 w-4" />
          </AButton>
        </div>
      </form>
    </div>
  )
}
