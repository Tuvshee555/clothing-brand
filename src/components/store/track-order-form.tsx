'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { Field, Input } from '@/components/ui/form'
import { trackOrderAction } from '@/server/actions/store'

/** «Захиалга хянах»: order number + the phone it was placed with opens the order on any device. */
export function TrackOrderForm({ defaultNumber = '' }: { defaultNumber?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [number, setNumber] = useState(defaultNumber)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          setFieldErrors({})
          const res = await trackOrderAction({ number, phone })
          if (res.ok) {
            router.push(`/orders/${res.data.number}?t=${encodeURIComponent(res.data.token)}`)
            return
          }
          setError(res.error)
          setFieldErrors(res.fieldErrors ?? {})
        })
      }}
    >
      <Field id="track-number" label="Захиалгын дугаар" error={fieldErrors.number} hint="Жишээ: MN-10001">
        <Input
          id="track-number"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!fieldErrors.number}
          aria-describedby="track-number-hint"
        />
      </Field>
      <Field id="track-phone" label="Захиалга өгсөн утасны дугаар" error={fieldErrors.phone} hint="8 оронтой. Жишээ: 9911 2233">
        <Input
          id="track-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={!!fieldErrors.phone}
          aria-describedby="track-phone-hint"
        />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Хайж байна…' : 'Захиалга хайх'}
      </Button>
    </form>
  )
}
