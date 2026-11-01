'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AUDIENCE_LABELS, PRODUCT_STATUS_LABELS, TAG_LABELS, type Audience, type ProductStatus } from '@/lib/catalog'
import { slugify } from '@/lib/slug'
import { SMART_COLLECTIONS } from '@/lib/catalog-filter'
import { createProductAction, updateProductAction } from '@/server/actions/admin'
import { AButton, ainput } from './ui'
import { ActionFeedback, FieldError, useAdminAction } from './use-admin-action'

export interface ProductFormValues {
  name: string
  slug: string
  categoryId: string
  audience: Audience
  shortDescription: string
  description: string
  material: string
  care: string
  fit: string
  basePrice: number
  status: ProductStatus
  isFeatured: boolean
  isNewArrival: boolean
  tags: string[]
  collectionIds: string[]
  seoTitle: string
  seoDescription: string
}

function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12.5px] font-medium">
      {children}
      {hint && <span className="ml-1.5 font-normal text-stone-500">{hint}</span>}
    </label>
  )
}

export function ProductForm({
  productId,
  initial,
  categories,
  collections,
  readOnly,
}: {
  productId?: string
  initial: ProductFormValues
  categories: { id: string; name: string }[]
  collections: { id: string; name: string; slug: string }[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(!!productId)
  const [tagText, setTagText] = useState(initial.tags.join(', '))
  const [priceText, setPriceText] = useState(String(initial.basePrice || ''))
  const { pending, error, fieldErrors, message, run } = useAdminAction()
  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setV((s) => ({ ...s, [key]: value }))
  const manualCollections = collections.filter((c) => !(c.slug in SMART_COLLECTIONS))

  const submit = () => {
    const payload = {
      ...v,
      basePrice: Number(priceText.replace(/[\s,₮]/g, '')) || 0,
      tags: tagText
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      fit: v.fit || null,
      seoTitle: v.seoTitle || null,
      seoDescription: v.seoDescription || null,
    }
    if (productId) run(() => updateProductAction(productId, payload), 'Хадгалагдлаа. Дэлгүүрт шууд шинэчлэгдсэн.', () => router.refresh())
    else run(() => createProductAction(payload))
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="space-y-5"
    >
      <fieldset disabled={readOnly || pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-name">Нэр</Label>
            <input
              id="p-name"
              className={ainput}
              value={v.name}
              aria-invalid={!!fieldErrors.name}
              onChange={(e) => {
                set('name', e.target.value)
                if (!slugTouched) set('slug', slugify(e.target.value))
              }}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="p-slug" hint="(вэб хаяг — нэрнээс автоматаар)">
              /products/
            </Label>
            <input
              id="p-slug"
              className={ainput}
              value={v.slug}
              aria-invalid={!!fieldErrors.slug}
              onChange={(e) => {
                setSlugTouched(true)
                set('slug', e.target.value)
              }}
            />
            <FieldError message={fieldErrors.slug} />
          </div>
          <div>
            <Label htmlFor="p-category">Ангилал</Label>
            <select id="p-category" className={ainput} value={v.categoryId} onChange={(e) => set('categoryId', e.target.value)} aria-invalid={!!fieldErrors.categoryId}>
              <option value="">Сонгох…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.categoryId} />
          </div>
          <div>
            <Label htmlFor="p-audience">Зориулалт</Label>
            <select id="p-audience" className={ainput} value={v.audience} onChange={(e) => set('audience', e.target.value as Audience)}>
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="p-price" hint="(₮, хувилбар бүр өөрийн үнэтэй байж болно)">
              Үндсэн үнэ
            </Label>
            <input id="p-price" inputMode="numeric" className={ainput} value={priceText} onChange={(e) => setPriceText(e.target.value)} aria-invalid={!!fieldErrors.basePrice} />
            <FieldError message={fieldErrors.basePrice} />
          </div>
          <div>
            <Label htmlFor="p-status">Төлөв</Label>
            <select id="p-status" className={ainput} value={v.status} onChange={(e) => set('status', e.target.value as ProductStatus)} aria-invalid={!!fieldErrors.status}>
              {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.status} />
          </div>
        </div>

        <div>
          <Label htmlFor="p-short">Товч тайлбар</Label>
          <input id="p-short" className={ainput} value={v.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} aria-invalid={!!fieldErrors.shortDescription} />
          <FieldError message={fieldErrors.shortDescription} />
        </div>
        <div>
          <Label htmlFor="p-desc">Дэлгэрэнгүй тайлбар</Label>
          <textarea id="p-desc" rows={6} className={ainput} value={v.description} onChange={(e) => set('description', e.target.value)} aria-invalid={!!fieldErrors.description} />
          <FieldError message={fieldErrors.description} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="p-material">Материал</Label>
            <input id="p-material" className={ainput} value={v.material} onChange={(e) => set('material', e.target.value)} aria-invalid={!!fieldErrors.material} />
            <FieldError message={fieldErrors.material} />
          </div>
          <div>
            <Label htmlFor="p-care">Арчилгаа</Label>
            <input id="p-care" className={ainput} value={v.care} onChange={(e) => set('care', e.target.value)} aria-invalid={!!fieldErrors.care} />
            <FieldError message={fieldErrors.care} />
          </div>
          <div>
            <Label htmlFor="p-fit">Хэлбэр</Label>
            <input id="p-fit" className={ainput} value={v.fit} onChange={(e) => set('fit', e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-tags" hint="(таслалаар — туслах, шүүлтүүр ашиглана)">
              Шошго
            </Label>
            <input id="p-tags" className={ainput} value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="winter, wool, layering" />
            <p className="mt-1 text-[11.5px] text-stone-500">
              Танигддаг: {Object.entries(TAG_LABELS)
                .map(([k, l]) => `${k} (${l})`)
                .join(', ')}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[12.5px] font-medium">Онцлох</p>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Онцлох бараа (эхэнд гарна)
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={v.isNewArrival} onChange={(e) => set('isNewArrival', e.target.checked)} /> Шинэ ирэлт («Шинэ» цуглуулгад автоматаар)
            </label>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12.5px] font-medium">Цуглуулга</p>
          <div className="flex flex-wrap gap-2">
            {manualCollections.map((c) => {
              const on = v.collectionIds.includes(c.id)
              return (
                <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] ${on ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => set('collectionIds', on ? v.collectionIds.filter((x) => x !== c.id) : [...v.collectionIds, c.id])}
                  />
                  {c.name}
                </label>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11.5px] text-stone-500">«Шинэ ирэлт», «Эмэгтэй», «Эрэгтэй» цуглуулга барааны мэдээллээс автоматаар бүрдэнэ.</p>
        </div>

        <details className="rounded-lg border border-stone-200 p-3">
          <summary className="text-[12.5px] font-medium">Хайлтын систем (SEO)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-seo-title">Гарчиг</Label>
              <input id="p-seo-title" className={ainput} value={v.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} maxLength={70} />
            </div>
            <div>
              <Label htmlFor="p-seo-desc">Тайлбар</Label>
              <input id="p-seo-desc" className={ainput} value={v.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} maxLength={170} />
            </div>
          </div>
        </details>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <AButton type="submit" disabled={readOnly || pending}>
          {pending ? 'Хадгалж байна…' : productId ? 'Хадгалах' : 'Бараа үүсгэх'}
        </AButton>
        {readOnly && <span className="text-[12.5px] text-stone-600">Демо горимд засварлах боломжгүй — зөвхөн харах.</span>}
      </div>
      <ActionFeedback error={error} message={message} />
    </form>
  )
}
