'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteFaqAction, saveFaqAction } from '@/server/actions/assistant'
import { AButton, ainput } from '../ui'
import { ActionFeedback, FieldError, useAdminAction } from '../use-admin-action'

type Faq = { id: string | null; question: string; answer: string; enabled: boolean; sortOrder: number }

function FaqRow({ faq, readOnly, onDone }: { faq: Faq; readOnly: boolean; onDone: () => void }) {
  const [v, setV] = useState(faq)
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  const isNew = !faq.id
  return (
    <form
      className="space-y-2 rounded-lg border border-stone-200 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveFaqAction(v), isNew ? 'Нэмэгдлээ.' : 'Хадгалагдлаа.', onDone)
      }}
    >
      <fieldset disabled={readOnly || pending} className="space-y-2">
        <input className={ainput} value={v.question} onChange={(e) => setV({ ...v, question: e.target.value })} placeholder="Асуулт, жишээ: Дэлгүүр дээр очиж үзэж болох уу?" aria-label="Асуулт" maxLength={300} />
        <FieldError message={fieldErrors.question} />
        <textarea className={ainput} rows={3} value={v.answer} onChange={(e) => setV({ ...v, answer: e.target.value })} placeholder="Хариулт (туслах үгчлэн хэлнэ). Үнэ, үлдэгдэл бичихгүй — тэдгээрийг сангаас уншина." aria-label="Хариулт" maxLength={1500} />
        <FieldError message={fieldErrors.answer} />
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> Идэвхтэй
        </label>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <AButton type="submit" size="sm" disabled={pending}>
            {isNew ? (
              <>
                <Plus className="h-3.5 w-3.5" /> Нэмэх
              </>
            ) : (
              'Хадгалах'
            )}
          </AButton>
          {!isNew && (
            <AButton
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => confirm('Энэ асуултыг устгах уу?') && run(() => deleteFaqAction(faq.id!), 'Устгалаа.', onDone)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Устгах
            </AButton>
          )}
        </div>
      )}
      <ActionFeedback error={error} message={message} />
    </form>
  )
}

export function FaqEditor({ faqs, readOnly }: { faqs: Faq[]; readOnly: boolean }) {
  const router = useRouter()
  const [adding, setAdding] = useState(0)
  return (
    <div className="space-y-3">
      {faqs.map((f) => (
        <FaqRow key={f.id} faq={f} readOnly={readOnly} onDone={() => router.refresh()} />
      ))}
      {!readOnly && (
        <FaqRow
          key={`new-${adding}`}
          faq={{ id: null, question: '', answer: '', enabled: true, sortOrder: faqs.length + 1 }}
          readOnly={false}
          onDone={() => {
            setAdding((n) => n + 1)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
