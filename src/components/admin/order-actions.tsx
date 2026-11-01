'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { nextStatuses, STATUS_ACTION_LABELS, type OrderStatus } from '@/lib/orders'
import { changeOrderStatusAction, recordCashPaymentAction } from '@/server/actions/admin'
import { AButton, ainput } from './ui'
import { ActionFeedback, useAdminAction } from './use-admin-action'

export function OrderActions({
  orderId,
  status,
  canUpdate,
  lockedReason,
  canRecordCash,
}: {
  orderId: string
  status: OrderStatus
  canUpdate: boolean
  lockedReason: string | null
  canRecordCash: boolean
}) {
  const router = useRouter()
  const { pending, error, message, run } = useAdminAction()
  const [cancelling, setCancelling] = useState(false)
  const [note, setNote] = useState('')
  const options = nextStatuses(status)

  if (options.length === 0 && !canRecordCash) {
    return <p className="text-[13px] text-stone-600">{status === 'cancelled' ? 'Цуцлагдсан захиалга. Цаашид өөрчлөх зүйлгүй.' : 'Захиалга хүргэгдэж дууссан.'}</p>
  }
  if (!canUpdate) {
    return <p className="rounded-lg bg-paper-2 px-3 py-2 text-[12.5px] text-stone-600">{lockedReason}</p>
  }

  const go = (to: OrderStatus, reason?: string) =>
    run(() => changeOrderStatusAction({ orderId, to, note: reason ?? null }), 'Төлөв шинэчлэгдлээ.', () => {
      setCancelling(false)
      setNote('')
      router.refresh()
    })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options
          .filter((s) => s !== 'cancelled')
          .map((s) => (
            <AButton key={s} disabled={pending} onClick={() => go(s)}>
              {STATUS_ACTION_LABELS[s]}
            </AButton>
          ))}
        {options.includes('cancelled') && !cancelling && (
          <AButton variant="secondary" disabled={pending} onClick={() => setCancelling(true)}>
            Цуцлах
          </AButton>
        )}
        {canRecordCash && (
          <AButton variant="subtle" disabled={pending} onClick={() => run(() => recordCashPaymentAction(orderId), 'Төлбөр бүртгэгдлээ.', () => router.refresh())}>
            Бэлэн төлбөр хүлээн авснаа бүртгэх
          </AButton>
        )}
      </div>
      {cancelling && (
        <div className="space-y-2 rounded-lg border border-danger/25 bg-danger-soft/50 p-3">
          <label htmlFor="cancel-note" className="block text-[12.5px] font-medium">
            Цуцлах шалтгаан
          </label>
          <textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={ainput} placeholder="Жишээ: худалдан авагч хэмжээгээ солихоор шийдсэн" />
          <p className="text-[12px] text-stone-600">Цуцлахад нөөцөлсөн бараа агуулахад автоматаар буцна.</p>
          <div className="flex gap-2">
            <AButton variant="danger" disabled={pending || note.trim().length < 3} onClick={() => go('cancelled', note.trim())}>
              Захиалга цуцлах
            </AButton>
            <AButton variant="ghost" onClick={() => setCancelling(false)}>
              Болих
            </AButton>
          </div>
        </div>
      )}
      <ActionFeedback error={error} message={message} />
    </div>
  )
}
