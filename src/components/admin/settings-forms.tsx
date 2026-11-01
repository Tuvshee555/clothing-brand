'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Policies, PolicyKey, StoreInfo } from '@/lib/settings'
import { changePasswordAction } from '@/server/actions/auth'
import { saveCategoryAction, saveCollectionAction, savePolicyAction, saveShippingMethodAction, saveStoreInfoAction } from '@/server/actions/admin'
import { slugify } from '@/lib/slug'
import { AButton, ainput } from './ui'
import { ActionFeedback, FieldError, useAdminAction } from './use-admin-action'

function L({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-medium">
      {children}
    </label>
  )
}

export function StoreInfoForm({ initial, readOnly }: { initial: StoreInfo; readOnly: boolean }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveStoreInfoAction(v), 'Хадгалагдлаа.', () => router.refresh())
      }}
    >
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-2">
        <div>
          <L htmlFor="s-name">Дэлгүүрийн нэр</L>
          <input id="s-name" className={ainput} value={v.storeName} onChange={(e) => setV({ ...v, storeName: e.target.value })} />
          <FieldError message={fieldErrors.storeName} />
        </div>
        <div>
          <L htmlFor="s-tagline">Уриа</L>
          <input id="s-tagline" className={ainput} value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} />
        </div>
        <div>
          <L htmlFor="s-email">Холбоо барих и-мэйл</L>
          <input id="s-email" className={ainput} value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />
          <FieldError message={fieldErrors.contactEmail} />
        </div>
        <div>
          <L htmlFor="s-hours">Ажлын цаг</L>
          <input id="s-hours" className={ainput} value={v.contactHours} onChange={(e) => setV({ ...v, contactHours: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <L htmlFor="s-ann">Мэдэгдлийн мөр (сайтын дээд талд)</L>
          <input id="s-ann" className={ainput} value={v.announcement} onChange={(e) => setV({ ...v, announcement: e.target.value })} maxLength={160} />
          <label className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.announcementEnabled} onChange={(e) => setV({ ...v, announcementEnabled: e.target.checked })} /> Харуулах
          </label>
        </div>
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

export function PolicyForm({ policyKey, initial, readOnly }: { policyKey: PolicyKey; initial: Policies[PolicyKey]; readOnly: boolean }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => savePolicyAction({ key: policyKey, title, body }), 'Хадгалагдлаа. Дэлгүүрт шууд шинэчлэгдсэн.', () => router.refresh())
      }}
    >
      <fieldset disabled={readOnly || pending} className="space-y-3">
        <input className={ainput} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Гарчиг" />
        <textarea className={ainput} rows={8} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Агуулга" />
        <FieldError message={fieldErrors.body} />
      </fieldset>
      {!readOnly && (
        <AButton type="submit" size="sm" disabled={pending}>
          Хадгалах
        </AButton>
      )}
      <ActionFeedback error={error} message={message} />
    </form>
  )
}

export function ShippingMethodForm({
  method,
  readOnly,
}: {
  method: { id: string; name: string; description: string; fee: number; freeThreshold: number | null; eta: string; isActive: boolean; region: string }
  readOnly: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState({ ...method, fee: String(method.fee), freeThreshold: method.freeThreshold ? String(method.freeThreshold) : '' })
  const { pending, error, message, run } = useAdminAction()
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            saveShippingMethodAction({
              id: v.id,
              name: v.name,
              description: v.description,
              fee: Number(v.fee) || 0,
              freeThreshold: v.freeThreshold ? Number(v.freeThreshold) : null,
              eta: v.eta,
              isActive: v.isActive,
            }),
          'Хадгалагдлаа.',
          () => router.refresh(),
        )
      }}
    >
      <fieldset disabled={readOnly || pending} className="contents">
        <div>
          <L htmlFor={`sm-name-${v.id}`}>{v.region === 'ub' ? 'Улаанбаатар' : 'Орон нутаг'}</L>
          <input id={`sm-name-${v.id}`} className={ainput} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div>
          <L htmlFor={`sm-fee-${v.id}`}>Төлбөр (₮)</L>
          <input id={`sm-fee-${v.id}`} inputMode="numeric" className={ainput} value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value.replace(/[^\d]/g, '') })} />
        </div>
        <div>
          <L htmlFor={`sm-free-${v.id}`}>Үнэгүй болох дүн</L>
          <input id={`sm-free-${v.id}`} inputMode="numeric" className={ainput} value={v.freeThreshold} placeholder="—" onChange={(e) => setV({ ...v, freeThreshold: e.target.value.replace(/[^\d]/g, '') })} />
        </div>
        <div>
          <L htmlFor={`sm-eta-${v.id}`}>Хугацаа</L>
          <input id={`sm-eta-${v.id}`} className={ainput} value={v.eta} onChange={(e) => setV({ ...v, eta: e.target.value })} />
        </div>
        <div className="flex items-center gap-3 pb-2">
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Идэвхтэй
          </label>
          {!readOnly && (
            <AButton type="submit" size="sm" disabled={pending}>
              Хадгалах
            </AButton>
          )}
        </div>
      </fieldset>
      <div className="sm:col-span-5">
        <ActionFeedback error={error} message={message} />
      </div>
    </form>
  )
}

export function PasswordForm() {
  const [v, setV] = useState({ current: '', next: '', confirm: '' })
  const { pending, error, fieldErrors, run } = useAdminAction()
  return (
    <form
      className="grid max-w-md gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => changePasswordAction(v))
      }}
    >
      <input type="password" autoComplete="current-password" className={ainput} placeholder="Одоогийн нууц үг" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} aria-label="Одоогийн нууц үг" />
      <FieldError message={fieldErrors.current} />
      <input type="password" autoComplete="new-password" className={ainput} placeholder="Шинэ нууц үг (10+ тэмдэгт)" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} aria-label="Шинэ нууц үг" />
      <FieldError message={fieldErrors.next} />
      <input type="password" autoComplete="new-password" className={ainput} placeholder="Шинэ нууц үгээ давтах" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} aria-label="Шинэ нууц үгээ давтах" />
      <FieldError message={fieldErrors.confirm} />
      <AButton type="submit" variant="secondary" disabled={pending}>
        Нууц үг солих
      </AButton>
      <ActionFeedback error={error} />
    </form>
  )
}

export function TaxonomyForm({
  kind,
  initial,
  readOnly,
  smartRule,
}: {
  kind: 'category' | 'collection'
  initial: { id?: string; name: string; slug: string; description: string | null; eyebrow?: string | null; sortOrder: number; isActive: boolean; isFeatured?: boolean }
  readOnly: boolean
  smartRule?: string
}) {
  const router = useRouter()
  const [v, setV] = useState({ ...initial, description: initial.description ?? '', eyebrow: initial.eyebrow ?? '' })
  const [slugTouched, setSlugTouched] = useState(!!initial.id)
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        const payload = { ...v, description: v.description || null, eyebrow: v.eyebrow || null }
        run(() => (kind === 'category' ? saveCategoryAction(payload) : saveCollectionAction({ ...payload, isFeatured: !!v.isFeatured })), 'Хадгалагдлаа.', () => {
          if (!initial.id) setV({ ...initial, description: '', eyebrow: '' })
          router.refresh()
        })
      }}
    >
      <fieldset disabled={readOnly || pending} className="grid gap-2 sm:grid-cols-[1fr_1fr_80px]">
        <input
          className={ainput}
          placeholder="Нэр"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
          aria-label="Нэр"
        />
        <input
          className={ainput}
          placeholder="вэб-хаяг"
          value={v.slug}
          onChange={(e) => {
            setSlugTouched(true)
            setV({ ...v, slug: e.target.value })
          }}
          aria-label="Вэб хаяг"
          aria-invalid={!!fieldErrors.slug}
        />
        <input className={ainput} inputMode="numeric" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} aria-label="Дараалал" />
        <input className={`${ainput} sm:col-span-3`} placeholder="Тайлбар" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} aria-label="Тайлбар" />
        <div className="flex flex-wrap items-center gap-4 sm:col-span-3">
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Идэвхтэй
          </label>
          {kind === 'collection' && (
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={!!v.isFeatured} onChange={(e) => setV({ ...v, isFeatured: e.target.checked })} /> Нүүр хуудсанд онцлох
            </label>
          )}
          {smartRule && <span className="text-[12px] text-stone-500">Автомат: {smartRule}</span>}
          {!readOnly && (
            <AButton type="submit" size="sm" disabled={pending} className="ml-auto">
              {initial.id ? 'Хадгалах' : 'Нэмэх'}
            </AButton>
          )}
        </div>
      </fieldset>
      <FieldError message={fieldErrors.slug ?? fieldErrors.name} />
      <ActionFeedback error={error} message={message} />
    </form>
  )
}
