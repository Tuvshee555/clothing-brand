'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { cn } from '@/lib/cn'
import { formatMoney, shippingFeeFor } from '@/lib/money'
import { PROVINCES, UB_DISTRICTS, type Region } from '@/lib/regions'
import { fieldErrors as zodFieldErrors } from '@/lib/validation/common'
import { checkoutInput } from '@/lib/validation/store'
import { placeOrderAction } from '@/server/actions/store'
import type { CartLine } from '@/server/services/cart'

type Shipping = { code: string; name: string; description: string; region: Region; fee: number; freeThreshold: number | null; eta: string }

// One delivery decision, goodprice-style: where (a city district or a province), then how fast.
// The place select carries its region so a district and a province with the same name
// (Сүхбаатар) stay apart: «ub:Сүхбаатар» / «countryside:Сүхбаатар».
const placeValue = (region: Region, name: string) => `${region}:${name}`
const parsePlace = (value: string): { region: Region; name: string } | null => {
  const [region, name] = value.split(':')
  return (region === 'ub' || region === 'countryside') && name ? { region, name } : null
}

const SAMPLE = {
  name: 'Б. Энхжин (жишээ)',
  phone: '8000 0000',
  email: '',
  place: placeValue('ub', 'Хан-Уул'),
  khoroo: '15',
  line: 'Жишээ хотхон, 3-р байр, 2-р орц, 45 тоот',
}

/** Form fields in page order, with the element a failed field scrolls to. */
const FIELD_ORDER: { key: string; label: string; target: string }[] = [
  { key: 'name', label: 'Нэр', target: 'name' },
  { key: 'phone', label: 'Утасны дугаар', target: 'phone' },
  { key: 'email', label: 'И-мэйл', target: 'email' },
  { key: 'district', label: 'Хүргэх газар', target: 'place' },
  { key: 'shippingMethod', label: 'Хүргэлтийн хурд', target: 'place' },
  { key: 'khoroo', label: 'Хороо / сум', target: 'khoroo' },
  { key: 'address', label: 'Хаяг', target: 'address' },
  { key: 'deliveryNote', label: 'Хүргэлтийн тэмдэглэл', target: 'deliveryNote' },
  { key: 'paymentMethod', label: 'Төлбөр', target: 'payment-qpay' },
]

/** «Улаанбаатар — энгийн хүргэлт» → «Энгийн хүргэлт» once the place is already chosen. */
const shortName = (name: string) => {
  const s = name.replace(/^[^—]*—\s*/, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** «15» → «15-р хороо, …»; «Дархан» → «Дархан сум, …»; already-written words are kept. */
function composeAddress(region: Region, khoroo: string, line: string): string {
  const k = khoroo.trim()
  const l = line.trim()
  if (!k) return l
  const head = region === 'ub' ? (/хороо/i.test(k) ? k : /^\d+$/.test(k) ? `${k}-р хороо` : k) : /сум/i.test(k) ? k : `${k} сум`
  return l ? `${head}, ${l}` : head
}

export function CheckoutForm({ lines, subtotal, shipping }: { lines: CartLine[]; subtotal: number; shipping: Shipping[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ name: '', phone: '', email: '', place: '', khoroo: '', line: '', deliveryNote: '' })
  const [noteOpen, setNoteOpen] = useState(false)
  const [method, setMethod] = useState(shipping.find((s) => s.region === 'ub')?.code ?? shipping[0]?.code ?? '')
  const [payment, setPayment] = useState<'qpay' | 'cash_on_delivery'>('qpay')

  const place = parsePlace(form.place)
  const region: Region = place?.region ?? 'ub'
  const methods = shipping.filter((s) => s.region === region)
  const selected = methods.find((s) => s.code === method) ?? methods[0]
  const fee = selected ? shippingFeeFor(subtotal, selected) : 0
  const total = subtotal + fee
  const err = (key: string) => fieldErrors[key]

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    // A corrected field drops its old message (the server re-checks everything on submit).
    const keys = key === 'place' ? ['district', 'shippingMethod'] : key === 'line' ? ['address'] : [key]
    if (keys.some((k) => fieldErrors[k])) setFieldErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))))
  }
  const choosePlace = (value: string) => {
    update('place', value)
    const next = parsePlace(value)
    if (next && !shipping.some((s) => s.code === method && s.region === next.region)) {
      const first = shipping.find((s) => s.region === next.region)
      if (first) setMethod(first.code)
    }
  }

  const showErrors = (errors: Record<string, string>, message: string | null) => {
    setFieldErrors(errors)
    setError(message)
    const first = FIELD_ORDER.find((f) => errors[f.key])
    // After React paints the messages: bring the first wrong field into view and focus it.
    requestAnimationFrame(() => {
      const el = first ? document.getElementById(first.target) : document.getElementById('checkout-errors')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (el instanceof HTMLElement) el.focus({ preventScroll: true })
    })
  }

  const submit = () =>
    start(async () => {
      setError(null)
      const input = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        shippingMethod: selected?.code ?? '',
        district: place?.name ?? '',
        address: composeAddress(region, form.khoroo, form.line),
        deliveryNote: form.deliveryNote,
        paymentMethod: payment,
        expectedTotal: total,
      }
      // Every mistake at once, before anything is sent: the same schema the server enforces,
      // plus the khoroo / sum the server only sees inside the address.
      const parsed = checkoutInput.safeParse(input)
      const local: Record<string, string> = parsed.success ? {} : zodFieldErrors(parsed.error)
      if (!place) local.district = 'Дүүрэг эсвэл аймгаа сонгоно уу.'
      if (!form.khoroo.trim()) local.khoroo = region === 'ub' ? 'Хороогоо оруулна уу.' : 'Сумаа оруулна уу.'
      if (!form.line.trim()) local.address = 'Байр, орц, тоотоо бичнэ үү.'
      if (Object.keys(local).length > 0) {
        showErrors(local, null)
        return
      }
      const res = await placeOrderAction(input)
      if (res.ok) {
        router.push(`/orders/${res.data.number}?t=${encodeURIComponent(res.data.token)}`)
        return
      }
      showErrors(res.fieldErrors ?? {}, res.fieldErrors && Object.keys(res.fieldErrors).length ? null : res.error)
      // Prices or stock changed: reload the summary with fresh server data.
      if (res.details || /үлдэгдэл|дүн/.test(res.error)) router.refresh()
    })

  const errorList = FIELD_ORDER.filter((f) => fieldErrors[f.key])
  const submitLabel = pending ? 'Захиалга үүсгэж байна…' : `Захиалах · ${formatMoney(total)}`

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="grid grid-cols-1 gap-10 pb-28 lg:grid-cols-[minmax(0,1fr)_400px] lg:pb-0"
    >
      <div className="space-y-9">
        <p className="-mt-4 text-[12.5px] text-stone-600">
          Туршиж үзэх үү?{' '}
          <button
            type="button"
            className="font-medium text-ink underline underline-offset-2"
            onClick={() => {
              setForm((f) => ({ ...f, ...SAMPLE }))
              setFieldErrors({})
              const ub = shipping.find((s) => s.region === 'ub')
              if (ub) setMethod(ub.code)
            }}
          >
            Жишээ мэдээллээр бөглөх
          </button>
        </p>

        {(errorList.length > 0 || error) && (
          <div id="checkout-errors" tabIndex={-1} role="alert" className="border border-danger/30 bg-danger-soft px-4 py-3 text-[13.5px] text-danger outline-none">
            {errorList.length > 0 ? (
              <>
                <p className="font-medium">Захиалахын өмнө {errorList.length} зүйлийг засна уу:</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {errorList.map((f) => (
                    <li key={f.key}>
                      <a href={`#${f.target}`} className="underline underline-offset-2">
                        {f.label}
                      </a>{' '}
                      — {fieldErrors[f.key]}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>{error}</p>
            )}
          </div>
        )}

        <fieldset className="space-y-5">
          <legend className="display mb-5 text-2xl">1. Холбоо барих</legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Нэр" required error={err('name')}>
              <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} autoComplete="name" aria-invalid={!!err('name')} aria-describedby="name-hint" />
            </Field>
            <Field id="phone" label="Утасны дугаар" required error={err('phone')} hint="8 оронтой. Жишээ: 9911 2233">
              <Input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} inputMode="tel" autoComplete="tel" aria-invalid={!!err('phone')} aria-describedby="phone-hint" />
            </Field>
          </div>
          <Field id="email" label="И-мэйл" optional error={err('email')}>
            <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" aria-invalid={!!err('email')} aria-describedby="email-hint" />
          </Field>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="display mb-5 text-2xl">2. Хүргэлт</legend>
          <Field id="place" label="Хүргэх газар" required error={err('district') ?? err('shippingMethod')}>
            <Select id="place" value={form.place} onChange={(e) => choosePlace(e.target.value)} aria-invalid={!!(err('district') ?? err('shippingMethod'))} aria-describedby="place-hint">
              <option value="">Дүүрэг эсвэл аймгаа сонгоно уу…</option>
              <optgroup label="Улаанбаатар">
                {UB_DISTRICTS.map((d) => (
                  <option key={d} value={placeValue('ub', d)}>
                    {d} дүүрэг
                  </option>
                ))}
              </optgroup>
              <optgroup label="Орон нутаг">
                {PROVINCES.map((p) => (
                  <option key={p} value={placeValue('countryside', p)}>
                    {p} аймаг
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>

          <div className={cn('grid gap-2', methods.length > 1 && 'sm:grid-cols-2')} role="radiogroup" aria-label="Хүргэлтийн хурд">
            {methods.map((s) => {
              const sFee = shippingFeeFor(subtotal, s)
              const active = selected?.code === s.code
              return (
                <label key={s.code} className={cn('flex cursor-pointer items-start gap-3 border p-4 transition', active ? 'border-ink bg-white' : 'border-stone-300 hover:border-stone-500')}>
                  <input type="radio" name="shipping" value={s.code} checked={active} onChange={() => setMethod(s.code)} className="mt-1 accent-ink" />
                  <span className="flex-1">
                    <span className="flex justify-between gap-3 text-[14px] font-medium">
                      {shortName(s.name)}
                      <span className="tabular shrink-0">{sFee === 0 ? 'Үнэгүй' : formatMoney(sFee)}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-stone-600">
                      {s.eta}
                      {s.freeThreshold && sFee > 0 ? ` · ${formatMoney(s.freeThreshold)}-өөс дээш үнэгүй` : ''}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
            <Field id="khoroo" label={region === 'ub' ? 'Хороо' : 'Сум'} required error={err('khoroo')}>
              <Input
                id="khoroo"
                value={form.khoroo}
                onChange={(e) => update('khoroo', e.target.value)}
                inputMode={region === 'ub' ? 'numeric' : 'text'}
                placeholder={region === 'ub' ? 'Жш: 11' : 'Сум'}
                aria-invalid={!!err('khoroo')}
                aria-describedby="khoroo-hint"
              />
            </Field>
            <Field id="address" label="Хаяг" required error={err('address')}>
              <Input
                id="address"
                value={form.line}
                onChange={(e) => update('line', e.target.value)}
                autoComplete="street-address"
                placeholder={region === 'ub' ? 'Хороолол, байр, орц, тоот' : 'Баг, гудамж, байр, тоот'}
                aria-invalid={!!err('address')}
                aria-describedby="address-hint"
              />
            </Field>
          </div>
          {noteOpen || form.deliveryNote ? (
            <Field id="deliveryNote" label="Хүргэлтийн тэмдэглэл" optional error={err('deliveryNote')}>
              <Textarea id="deliveryNote" rows={2} value={form.deliveryNote} onChange={(e) => update('deliveryNote', e.target.value)} aria-describedby="deliveryNote-hint" />
            </Field>
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="text-[13px] text-stone-600 underline underline-offset-2 hover:text-ink">
              + Хүргэлтийн тэмдэглэл нэмэх (орцны код гэх мэт)
            </button>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="display mb-5 text-2xl">3. Төлбөр</legend>
          {(
            [
              { value: 'qpay', title: 'QPay', text: 'Банкны аппаар QR уншуулж эсвэл банкаа сонгоод шууд төлнө.' },
              { value: 'cash_on_delivery', title: 'Хүргэлтээр төлөх', text: 'Бараагаа хүлээн авахдаа бэлнээр эсвэл картаар төлнө.' },
            ] as const
          ).map((opt) => (
            <label key={opt.value} className={cn('flex cursor-pointer items-start gap-3 border p-4 transition', payment === opt.value ? 'border-ink bg-white' : 'border-stone-300 hover:border-stone-500')}>
              <input id={`payment-${opt.value === 'qpay' ? 'qpay' : 'cod'}`} type="radio" name="payment" value={opt.value} checked={payment === opt.value} onChange={() => setPayment(opt.value)} className="mt-1 accent-ink" />
              <span>
                <span className="block text-[14px] font-medium">{opt.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-stone-600">{opt.text}</span>
              </span>
            </label>
          ))}
          <p className="text-[12.5px] text-stone-600">Төлбөр баталгаажмагц И-баримт таны утасны дугаарт бүртгэгдэнэ.</p>
        </fieldset>
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
        <Button type="submit" size="lg" className="mt-6 hidden w-full lg:flex" disabled={pending}>
          {submitLabel}
        </Button>
      </aside>

      {/* Phones: the total and the button stay in reach at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-paper/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
