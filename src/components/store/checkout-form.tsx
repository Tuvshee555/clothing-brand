'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form'
import { cn } from '@/lib/cn'
import { formatMoney, shippingFeeFor } from '@/lib/money'
import { areasFor, type Region } from '@/lib/regions'
import { placeOrderAction } from '@/server/actions/store'
import type { CartLine } from '@/server/services/cart'

type Shipping = { code: string; name: string; description: string; region: Region; fee: number; freeThreshold: number | null; eta: string }

const SAMPLE = {
  name: 'Б. Энхжин (жишээ)',
  phone: '8000 0000',
  email: '',
  district: 'Хан-Уул',
  address: '15-р хороо, Жишээ хотхон, 3-р байр, 2-р орц, 45 тоот',
  deliveryNote: 'Демо захиалга — хүргэлт хийгдэхгүй',
}

export function CheckoutForm({ lines, subtotal, shipping }: { lines: CartLine[]; subtotal: number; shipping: Shipping[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ name: '', phone: '', email: '', district: '', address: '', deliveryNote: '' })
  const [method, setMethod] = useState(shipping[0]?.code ?? '')
  const [payment, setPayment] = useState<'qpay' | 'cash_on_delivery'>('qpay')
  const [acceptDemo, setAcceptDemo] = useState(false)

  const selected = shipping.find((s) => s.code === method)
  const fee = selected ? shippingFeeFor(subtotal, selected) : 0
  const total = subtotal + fee
  const areas = selected ? areasFor(selected.region) : []
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const err = (key: string) => fieldErrors[key]

  const submit = () =>
    start(async () => {
      setError(null)
      setFieldErrors({})
      const res = await placeOrderAction({ ...form, shippingMethod: method, paymentMethod: payment, acceptDemo, expectedTotal: total })
      if (res.ok) {
        router.push(`/orders/${res.data.number}?t=${encodeURIComponent(res.data.token)}`)
        return
      }
      setError(res.error)
      setFieldErrors(res.fieldErrors ?? {})
      // Prices or stock changed: reload the summary with fresh server data.
      if (res.details || /үлдэгдэл|дүн/.test(res.error)) router.refresh()
    })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="grid gap-10 lg:grid-cols-[1fr_400px]"
    >
      <div className="space-y-10">
        <Alert tone="info" title="Энэ бол демо захиалга">
          Бодит худалдан авалт, төлбөр хийгдэхгүй, ямар ч карт, данснаас мөнгө авахгүй. Бодит хувийн мэдээлэл оруулах шаардлагагүй.{' '}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              setForm(SAMPLE)
              const ub = shipping.find((s) => s.region === 'ub')
              if (ub) setMethod(ub.code)
            }}
          >
            Жишээ мэдээлэл бөглөх
          </button>
        </Alert>

        <fieldset className="space-y-5">
          <legend className="display mb-5 text-2xl">1. Холбоо барих</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Нэр" required error={err('name')}>
              <Input id="name" value={form.name} onChange={set('name')} autoComplete="name" aria-invalid={!!err('name')} aria-describedby="name-hint" />
            </Field>
            <Field id="phone" label="Утасны дугаар" required error={err('phone')} hint="8 оронтой. Жишээ: 9911 2233">
              <Input id="phone" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" aria-invalid={!!err('phone')} aria-describedby="phone-hint" />
            </Field>
          </div>
          <Field id="email" label="И-мэйл" optional error={err('email')}>
            <Input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" aria-invalid={!!err('email')} aria-describedby="email-hint" />
          </Field>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="display mb-5 text-2xl">2. Хүргэлт</legend>
          <div className="space-y-2" role="radiogroup" aria-label="Хүргэлтийн хэлбэр">
            {shipping.map((s) => {
              const sFee = shippingFeeFor(subtotal, s)
              return (
                <label key={s.code} className={cn('flex cursor-pointer items-start gap-3 border p-4 transition', method === s.code ? 'border-ink bg-white' : 'border-stone-300 hover:border-stone-500')}>
                  <input
                    type="radio"
                    name="shipping"
                    value={s.code}
                    checked={method === s.code}
                    onChange={() => {
                      setMethod(s.code)
                      if (s.region !== selected?.region) setForm((f) => ({ ...f, district: '' }))
                    }}
                    className="mt-1 accent-ink"
                  />
                  <span className="flex-1">
                    <span className="flex justify-between gap-3 text-[14px] font-medium">
                      {s.name}
                      <span className="tabular shrink-0">{sFee === 0 ? 'Үнэгүй' : formatMoney(sFee)}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-stone-600">
                      {s.description} · {s.eta}
                      {s.freeThreshold && sFee > 0 ? ` · ${formatMoney(s.freeThreshold)}-өөс дээш үнэгүй` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
          {err('shippingMethod') && <p className="text-[12.5px] font-medium text-danger">{err('shippingMethod')}</p>}
          <Field id="district" label={selected?.region === 'countryside' ? 'Аймаг' : 'Дүүрэг'} required error={err('district')}>
            <Select id="district" value={form.district} onChange={set('district')} aria-invalid={!!err('district')} aria-describedby="district-hint">
              <option value="">Сонгох…</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="address" label="Хаяг" required error={err('address')} hint="Хороо, байр, орц, давхар, тоот">
            <Textarea id="address" rows={3} value={form.address} onChange={set('address')} autoComplete="street-address" aria-invalid={!!err('address')} aria-describedby="address-hint" />
          </Field>
          <Field id="deliveryNote" label="Хүргэлтийн тэмдэглэл" optional error={err('deliveryNote')}>
            <Textarea id="deliveryNote" rows={2} value={form.deliveryNote} onChange={set('deliveryNote')} aria-describedby="deliveryNote-hint" />
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="display mb-5 text-2xl">3. Төлбөр</legend>
          {(
            [
              { value: 'qpay', title: 'QPay', text: 'Туршилтын (симуляц) горим: нэхэмжлэх дуурайлгаж харуулна, бодит мөнгө шилжихгүй.' },
              { value: 'cash_on_delivery', title: 'Хүргэлтээр төлөх', text: 'Бараагаа хүлээн авахдаа бэлнээр эсвэл картаар төлнө. (Демо: хүргэлт хийгдэхгүй.)' },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className={cn('flex cursor-pointer items-start gap-3 border p-4 transition', payment === opt.value ? 'border-ink bg-white' : 'border-stone-300 hover:border-stone-500')}>
              <input type="radio" name="payment" value={opt.value} checked={payment === opt.value} onChange={() => setPayment(opt.value)} className="mt-1 accent-ink" />
              <span>
                <span className="block text-[14px] font-medium">{opt.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-stone-600">{opt.text}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-2">
          <Checkbox
            checked={acceptDemo}
            onChange={(e) => setAcceptDemo(e.target.checked)}
            label="Энэ нь портфолио демо бөгөөд бодит худалдан авалт, төлбөр, хүргэлт хийгдэхгүй гэдгийг ойлголоо."
          />
          {err('acceptDemo') && <p className="text-[12.5px] font-medium text-danger">{err('acceptDemo')}</p>}
        </div>
      </div>

      <aside className="h-fit border border-stone-200 bg-white p-6 lg:sticky lg:top-24">
        <h2 className="eyebrow mb-5">Таны захиалга</h2>
        <ul className="space-y-4">
          {lines.map((l) => (
            <li key={l.itemId} className="flex gap-3">
              <span className="relative aspect-[4/5] w-14 shrink-0 bg-bone">
                {l.imageUrl && <Image src={l.imageUrl} alt={l.imageAlt} fill sizes="56px" className="object-cover" />}
                <span className="tabular absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center bg-ink px-1 text-[10px] text-white">{l.quantity}</span>
              </span>
              <span className="min-w-0 flex-1 text-[13px]">
                <span className="line-clamp-1">{l.productName}</span>
                <span className="text-stone-600">
                  {l.colorName} · {l.sizeLabel}
                </span>
              </span>
              <span className="tabular text-[13px]">{formatMoney(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-6 space-y-2 border-t border-stone-200 pt-4 text-[14px]">
          <div className="flex justify-between">
            <dt>Барааны дүн</dt>
            <dd className="tabular">{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Хүргэлт</dt>
            <dd className="tabular">{fee === 0 ? 'Үнэгүй' : formatMoney(fee)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-stone-200 pt-3">
            <dt className="font-medium">Нийт</dt>
            <dd className="tabular text-xl">{formatMoney(total)}</dd>
          </div>
        </dl>
        {error && <Alert tone="danger" className="mt-5">{error}</Alert>}
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending}>
          {pending ? 'Захиалга үүсгэж байна…' : 'Захиалга баталгаажуулах'}
        </Button>
        <p className="mt-3 text-[11.5px] leading-relaxed text-stone-500">Нийт дүнг сервер өөрөө дахин тооцоолж, үлдэгдлийг шалгаад бараагаа нөөцөлнө.</p>
      </aside>
    </form>
  )
}
