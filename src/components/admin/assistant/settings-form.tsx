'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { AssistantSettings } from '@/lib/assistant/settings'
import { MODEL_LABELS, SELECTABLE_MODELS } from '@/lib/chat/models'
import { saveAssistantSettingsAction } from '@/server/actions/assistant'
import { AButton, ainput } from '../ui'
import { ActionFeedback, FieldError, useAdminAction } from '../use-admin-action'

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 rounded-lg border border-stone-200 p-3">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        <span className="block text-[12px] text-stone-600">{hint}</span>
      </span>
    </label>
  )
}

function NumberField({ id, label, hint, value, onChange, step = 1, error }: { id: string; label: string; hint: string; value: number; onChange: (v: number) => void; step?: number; error?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-medium">
        {label}
      </label>
      <input id={id} type="number" inputMode="decimal" step={step} className={ainput} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />
      <p className="mt-1 text-[11.5px] text-stone-500">{hint}</p>
      <FieldError message={error} />
    </div>
  )
}

/** Plain-language chatbot settings; every field says what it changes. */
export function AssistantSettingsForm({ initial, readOnly, aiConfigured }: { initial: AssistantSettings; readOnly: boolean; aiConfigured: boolean }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  const set = <K extends keyof AssistantSettings>(key: K, value: AssistantSettings[K]) => setV((s) => ({ ...s, [key]: value }))
  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveAssistantSettingsAction(v), 'Хадгалагдлаа. Дараагийн мессежээс хэрэгжинэ.', () => router.refresh())
      }}
    >
      <fieldset disabled={readOnly || pending} className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-[14px] font-medium">Ерөнхий</h3>
          <Toggle id="as-enabled" label="Туслах ажиллана" hint="Унтраавал туслах хариулахгүй; мессеж ажилтанд үлдэнэ." checked={v.enabled} onChange={(x) => set('enabled', x)} />
          <div>
            <label htmlFor="as-greeting" className="mb-1 block text-[12.5px] font-medium">
              Мэндчилгээ
            </label>
            <textarea id="as-greeting" className={ainput} rows={2} maxLength={300} value={v.greeting} onChange={(e) => set('greeting', e.target.value)} />
            <FieldError message={fieldErrors.greeting} />
          </div>
          <Toggle id="as-exact" label="Үлдэгдлийн яг тоог хэлэх" hint="Унтраавал «бэлэн / цөөн үлдсэн / дууссан» гэж л хэлнэ." checked={v.showExactStock} onChange={(x) => set('showExactStock', x)} />
        </section>

        <section className="space-y-3">
          <h3 className="text-[14px] font-medium">AI загвар</h3>
          {!aiConfigured && <p className="rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-warning">OpenAI түлхүүр тохируулаагүй тул туслах каталогийн (дүрмийн) горимд ажиллаж байна. Доорх тохиргоо түлхүүр нэмэгдмэгц хэрэгжинэ.</p>}
          <Toggle id="as-ai" label="AI ашиглах" hint="Нээлттэй асуулт, зөвлөмжид AI хариулна. Үнэ, үлдэгдэл, хүргэлт, захиалгыг үргэлж дүрмээр, сангаас шууд хариулна." checked={v.aiEnabled} onChange={(x) => set('aiEnabled', x)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="as-model" className="mb-1 block text-[12.5px] font-medium">
                Загвар
              </label>
              <select id="as-model" className={ainput} value={v.aiModel} onChange={(e) => set('aiModel', e.target.value as AssistantSettings['aiModel'])}>
                {SELECTABLE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11.5px] text-stone-500">gpt-4.1-mini: Lorentz-ийн туршилтаар gpt-4.1-тэй ижил нарийвчлал, ойролцоогоор 5 дахин хямд.</p>
            </div>
            <NumberField id="as-budget" label="Өдрийн AI төсөв (USD)" hint="Хэтэрвэл маргааш хүртэл дүрмээр хариулна. 0 = AI унтраастай." value={v.aiDailyBudgetUsd} step={0.1} onChange={(x) => set('aiDailyBudgetUsd', x)} error={fieldErrors.aiDailyBudgetUsd} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[14px] font-medium">Чатаар захиалах</h3>
          <Toggle id="as-orders" label="Чатаар захиалга авах" hint="Туслах үнийг сангаас тооцоолж, худалдан авагч «тийм» гэж баталгаажуулсны дараа л захиалга үүсгэнэ. Төлбөр QPay (демо симуляц)." checked={v.chatOrdersEnabled} onChange={(x) => set('chatOrdersEnabled', x)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField id="as-hold" label="Нөөцлөх хугацаа (минут)" hint="Төлөөгүй чат захиалга энэ хугацааны дараа цуцлагдаж, бараа чөлөөлөгдөнө." value={v.reservationMinutes} onChange={(x) => set('reservationMinutes', x)} error={fieldErrors.reservationMinutes} />
            <NumberField id="as-active" label="Зэрэг төлөгдөөгүй захиалга" hint="Нэг хөтөч (худалдан авагч) хэдэн төлөгдөөгүй чат захиалгатай байж болох." value={v.maxActiveOrders} onChange={(x) => set('maxActiveOrders', x)} error={fieldErrors.maxActiveOrders} />
            <NumberField id="as-qty" label="Нэг бараанаас дээд тоо" hint="Илүү тоог сагсаар эсвэл ажилтнаар." value={v.maxQuantityPerItem} onChange={(x) => set('maxQuantityPerItem', x)} error={fieldErrors.maxQuantityPerItem} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[14px] font-medium">Ажилтанд шилжүүлэх</h3>
          <NumberField
            id="as-resume"
            label="Туслах руу автоматаар буцаах (цаг)"
            hint="Ажилтан хүлээн авсан яриад энэ хугацаанд бичээгүй бол туслах дахин хариулна. 0 = хэзээ ч буцаахгүй."
            value={v.handoverAutoResumeHours}
            onChange={(x) => set('handoverAutoResumeHours', x)}
            error={fieldErrors.handoverAutoResumeHours}
          />
        </section>
      </fieldset>
      {!readOnly && (
        <AButton type="submit" disabled={pending}>
          Хадгалах
        </AButton>
      )}
      <ActionFeedback error={error} message={message} />
    </form>
  )
}
