'use client'

import { Hand, Send, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { releaseAction, saveNotesAction, staffReplyAction, takeOverAction } from '@/server/actions/assistant'
import { AButton, ainput } from '../ui'
import { ActionFeedback, useAdminAction } from '../use-admin-action'

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/** Take over / hand back, and the staff reply box. Refreshes every 10 s while a person is answering. */
export function ConversationActions({ conversationId, paused, canAct, lockedReason }: { conversationId: string; paused: boolean; canAct: boolean; lockedReason: string | null }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const { pending, error, message, run } = useAdminAction()

  useEffect(() => {
    if (!paused) return
    const timer = setInterval(() => document.visibilityState === 'visible' && router.refresh(), 10_000)
    return () => clearInterval(timer)
  }, [paused, router])

  if (!canAct) return <p className="rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-stone-600">{lockedReason}</p>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {paused ? (
          <AButton variant="secondary" disabled={pending} onClick={() => run(() => releaseAction(conversationId), 'Туслах дахин хариулна.', () => router.refresh())}>
            <Undo2 className="h-4 w-4" /> Туслах руу буцаах
          </AButton>
        ) : (
          <AButton disabled={pending} onClick={() => run(() => takeOverAction(conversationId), 'Та яриаг хүлээн авлаа — туслах түр хариулахгүй.', () => router.refresh())}>
            <Hand className="h-4 w-4" /> Яриаг хүлээн авах
          </AButton>
        )}
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          run(() => staffReplyAction({ conversationId, text, clientMessageId: newId() }), undefined, () => {
            setText('')
            router.refresh()
          })
        }}
      >
        <label htmlFor="staff-reply" className="block text-[12.5px] font-medium">
          Ажилтны хариулт
        </label>
        <textarea id="staff-reply" className={ainput} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Худалдан авагчид энд бичнэ. Илгээхэд яриа таны мэдэлд шилжинэ." />
        <AButton type="submit" size="sm" disabled={pending || !text.trim()}>
          <Send className="h-3.5 w-3.5" /> Илгээх
        </AButton>
      </form>
      <ActionFeedback error={error} message={message} />
    </div>
  )
}

export function NotesForm({ conversationId, initial, canAct }: { conversationId: string; initial: string; canAct: boolean }) {
  const [notes, setNotes] = useState(initial)
  const { pending, error, message, run } = useAdminAction()
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveNotesAction({ conversationId, notes }), 'Хадгалагдлаа.')
      }}
    >
      <label htmlFor="conv-notes" className="block text-[12.5px] font-medium">
        Дотоод тэмдэглэл (зөвхөн ажилтанд)
      </label>
      <textarea id="conv-notes" className={ainput} rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canAct || pending} />
      {canAct && (
        <AButton type="submit" size="sm" variant="secondary" disabled={pending}>
          Хадгалах
        </AButton>
      )}
      <ActionFeedback error={error} message={message} />
    </form>
  )
}
