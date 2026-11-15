'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { formatMoney } from '@/lib/money'
import { checkPaymentAction, retryInvoiceAction, simulatePaymentAction } from '@/server/actions/store'

/** A deliberately non-scannable pattern standing in for a QR code in the demo. */
function DemoQr() {
  const finder = (x: number, y: number, x0: number, y0: number) => {
    const dx = x - x0
    const dy = y - y0
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return null
    return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
  }
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21
    const y = Math.floor(i / 21)
    const f = finder(x, y, 0, 0) ?? finder(x, y, 14, 0) ?? finder(x, y, 0, 14)
    return f ?? (x * 7 + y * 13 + x * y) % 5 < 2
  })
  return (
    <div className="relative mx-auto w-48">
      <div className="grid grid-cols-[repeat(21,1fr)] gap-0 border-8 border-white bg-white opacity-35" aria-hidden>
        {cells.map((on, i) => (
          <span key={i} className={on ? 'aspect-square bg-ink' : 'aspect-square bg-white'} />
        ))}
      </div>
      <span className="absolute inset-0 m-auto grid h-12 w-36 place-items-center bg-ink text-[11px] font-medium uppercase tracking-[0.14em] text-white">
        Демо · уншихгүй
      </span>
    </div>
  )
}

// The banks a QPay invoice lists for paying on a phone. In the demo, choosing
// one simulates that bank's app confirming the payment.
const DEMO_BANKS = ['Хаан банк', 'Голомт банк', 'Худалдаа хөгжлийн банк', 'Төрийн банк', 'Хас банк', 'MonPay'] as const

export function PaymentPanel({
  number,
  token,
  total,
  mode,
  hasInvoice,
  qrImage,
  qrSvg = null,
}: {
  number: string
  token: string | null
  total: number
  mode: 'mock' | 'sandbox' | 'production'
  hasInvoice: boolean
  qrImage: string | null
  /** Demo only: a real, scannable QR (it opens the agency's demo page, never a payment). */
  qrSvg?: string | null
}) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null)

  if (!hasInvoice) {
    return (
      <div className="space-y-3">
        <Alert tone="warning">Төлбөрийн нэхэмжлэх үүсээгүй байна.</Alert>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await retryInvoiceAction(number, token)
              if (!res.ok) setMessage({ tone: 'danger', text: res.error })
            })
          }
        >
          Нэхэмжлэх дахин үүсгэх
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {mode === 'mock' ? (
        <>
          <div className="mx-auto w-48 space-y-2 text-center">
            {qrSvg ? (
              <div
                role="img"
                aria-label="QPay QR код"
                className="border border-stone-200 bg-white p-2 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <DemoQr />
            )}
            <p className="tabular text-[15px] font-medium">{formatMoney(total)}</p>
          </div>
          <p className="text-center text-[13px] text-stone-600">Банкны аппаараа QR кодыг уншуулах эсвэл доороос банкаа сонгоно уу.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEMO_BANKS.map((bank) => (
              <button
                key={bank}
                type="button"
                disabled={pending}
                className="min-h-11 border border-stone-300 bg-white px-2 py-2 text-[12.5px] font-medium leading-tight transition hover:border-ink disabled:opacity-50"
                onClick={() =>
                  start(async () => {
                    setMessage(null)
                    const res = await simulatePaymentAction(number, token)
                    if (!res.ok) setMessage({ tone: 'danger', text: res.error })
                  })
                }
              >
                {pending ? 'Төлж байна…' : bank}
              </button>
            ))}
          </div>
          <p className="text-center text-[11.5px] text-stone-500">Демо: банкаа сонгоход төлбөр баталгаажсан мэт харагдана, мөнгө шилжихгүй.</p>
        </>
      ) : (
        <>
          {qrImage && (
            // eslint-disable-next-line @next/next/no-img-element -- QPay returns the QR as a base64 data URL.
            <img src={`data:image/png;base64,${qrImage}`} alt="QPay QR код" className="mx-auto w-48" />
          )}
          <p className="text-center text-[13px] text-stone-600">Банкны аппликейшнээрээ QR кодыг уншуулж төлнө үү.</p>
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await checkPaymentAction(number, token)
                if (!res.ok) setMessage({ tone: 'danger', text: res.error })
                else if (res.data.status !== 'paid') setMessage({ tone: 'info', text: 'Төлбөр хараахан ороогүй байна.' })
              })
            }
          >
            Төлбөр шалгах
          </Button>
        </>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  )
}
