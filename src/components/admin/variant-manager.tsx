'use client'

import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { sizeLabel, variantAvailability } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import { slugify } from '@/lib/slug'
import { addColorAction, addVariantsAction, updateVariantAction } from '@/server/actions/admin'
import { StockAdjust } from './stock-adjust'
import { AButton, ainput, StockBadge } from './ui'
import { ActionFeedback, useAdminAction } from './use-admin-action'

export interface VariantRow {
  id: string
  colorId: string
  size: string
  sku: string
  priceOverride: number | null
  stock: number
  lowStockThreshold: number
  isActive: boolean
}

function VariantEditor({ variant, basePrice, readOnly, canAdjust, label }: { variant: VariantRow; basePrice: number; readOnly: boolean; canAdjust: boolean; label: string }) {
  const router = useRouter()
  const [sku, setSku] = useState(variant.sku)
  const [price, setPrice] = useState(variant.priceOverride ? String(variant.priceOverride) : '')
  const [threshold, setThreshold] = useState(String(variant.lowStockThreshold))
  const [active, setActive] = useState(variant.isActive)
  const { pending, error, run } = useAdminAction()
  const dirty = sku !== variant.sku || price !== (variant.priceOverride ? String(variant.priceOverride) : '') || threshold !== String(variant.lowStockThreshold) || active !== variant.isActive
  return (
    <tr className="border-t border-stone-100 align-middle">
      <td className="px-3 py-2 text-[13px] font-medium">{sizeLabel(variant.size)}</td>
      <td className="px-3 py-2">
        <input className={`${ainput} h-8 font-mono text-[12px]`} value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} disabled={readOnly} aria-label={`${label} SKU`} />
      </td>
      <td className="px-3 py-2">
        <input
          className={`${ainput} h-8 w-28`}
          inputMode="numeric"
          value={price}
          placeholder={formatMoney(basePrice)}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
          disabled={readOnly}
          aria-label={`${label} тусгай үнэ`}
        />
      </td>
      <td className="px-3 py-2">
        <input className={`${ainput} h-8 w-16`} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ''))} disabled={readOnly} aria-label={`${label} доод хязгаар`} />
      </td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-1.5 text-[12.5px]">
          <input type="checkbox" className="h-4 w-4 accent-ink" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={readOnly} /> Идэвхтэй
        </label>
      </td>
      <td className="px-3 py-2">
        <StockBadge availability={variantAvailability(variant)} stock={variant.stock} />
      </td>
      <td className="relative px-3 py-2">
        <div className="flex items-center gap-2">
          {dirty && !readOnly && (
            <AButton
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () => updateVariantAction({ variantId: variant.id, sku, priceOverride: price ? Number(price) : null, lowStockThreshold: Number(threshold) || 0, isActive: active }),
                  undefined,
                  () => router.refresh(),
                )
              }
            >
              Хадгалах
            </AButton>
          )}
          <div className="relative">
            <StockAdjust variantId={variant.id} stock={variant.stock} disabled={!canAdjust} label={label} />
          </div>
        </div>
        {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}
      </td>
    </tr>
  )
}

export function VariantManager({
  productId,
  basePrice,
  colors,
  variants,
  readOnly,
  canAdjust,
}: {
  productId: string
  basePrice: number
  colors: { id: string; name: string; code: string; hex: string }[]
  variants: VariantRow[]
  readOnly: boolean
  canAdjust: boolean
}) {
  const router = useRouter()
  const colorAction = useAdminAction()
  const sizeAction = useAdminAction()
  const [colorName, setColorName] = useState('')
  const [colorCode, setColorCode] = useState('')
  const [colorHex, setColorHex] = useState('#8f877c')
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [sizes, setSizes] = useState('')
  const [initialStock, setInitialStock] = useState('0')

  return (
    <div className="space-y-5">
      {colors.length === 0 && <p className="text-[13px] text-stone-600">Эхлээд өнгө нэмнэ үү. Өнгө бүрт хэмжээ нэмэхэд хувилбар (SKU, үлдэгдэл) үүснэ.</p>}
      {colors.map((c) => {
        const rows = variants.filter((v) => v.colorId === c.id)
        return (
          <div key={c.id} className="overflow-hidden rounded-lg border border-stone-200">
            <div className="flex items-center justify-between gap-3 bg-paper px-3 py-2">
              <p className="flex items-center gap-2 text-[13px] font-medium">
                <span className="h-4 w-4 rounded border border-black/10" style={{ backgroundColor: c.hex }} /> {c.name}
                <span className="font-normal text-stone-500">· {rows.length} хэмжээ · {rows.reduce((s, r) => s + r.stock, 0)} ширхэг</span>
              </p>
              {!readOnly && (
                <AButton size="sm" variant="ghost" onClick={() => setAddingFor(addingFor === c.id ? null : c.id)}>
                  <Plus className="h-3.5 w-3.5" /> Хэмжээ нэмэх
                </AButton>
              )}
            </div>
            {addingFor === c.id && (
              <form
                className="flex flex-wrap items-end gap-2 border-t border-stone-200 bg-white px-3 py-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  sizeAction.run(
                    () =>
                      addVariantsAction({
                        productId,
                        colorId: c.id,
                        sizes: sizes
                          .split(/[,\s]+/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                        initialStock: Number(initialStock) || 0,
                      }),
                    'Хувилбарууд нэмэгдлээ.',
                    () => {
                      setSizes('')
                      setAddingFor(null)
                      router.refresh()
                    },
                  )
                }}
              >
                <div>
                  <label className="mb-1 block text-[12px] font-medium" htmlFor={`sizes-${c.id}`}>
                    Хэмжээнүүд
                  </label>
                  <input id={`sizes-${c.id}`} className={`${ainput} w-56`} value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium" htmlFor={`stock-${c.id}`}>
                    Эхний үлдэгдэл (тус бүр)
                  </label>
                  <input id={`stock-${c.id}`} inputMode="numeric" className={`${ainput} w-28`} value={initialStock} onChange={(e) => setInitialStock(e.target.value.replace(/[^\d]/g, ''))} />
                </div>
                <AButton type="submit" size="md" disabled={sizeAction.pending || !sizes.trim()}>
                  Нэмэх
                </AButton>
                {sizeAction.error && <p className="w-full text-[12px] text-danger">{sizeAction.error}</p>}
              </form>
            )}
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-stone-500">
                      <th className="px-3 py-2 font-medium">Хэмжээ</th>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Тусгай үнэ</th>
                      <th className="px-3 py-2 font-medium">Доод хязгаар</th>
                      <th className="px-3 py-2 font-medium">Худалдаанд</th>
                      <th className="px-3 py-2 font-medium">Үлдэгдэл</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => (
                      <VariantEditor key={v.id} variant={v} basePrice={basePrice} readOnly={readOnly} canAdjust={canAdjust} label={`${c.name}, ${sizeLabel(v.size)}`} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-stone-300 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            colorAction.run(
              () => addColorAction({ productId, name: colorName, code: colorCode || slugify(colorName), hex: colorHex }),
              'Өнгө нэмэгдлээ. Одоо хэмжээ нэмнэ үү.',
              () => {
                setColorName('')
                setColorCode('')
                router.refresh()
              },
            )
          }}
        >
          <div>
            <label className="mb-1 block text-[12px] font-medium" htmlFor="color-name">
              Шинэ өнгө
            </label>
            <input id="color-name" className={`${ainput} w-44`} value={colorName} onChange={(e) => setColorName(e.target.value)} placeholder="Жишээ: Хар хөх" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium" htmlFor="color-code">
              Код
            </label>
            <input id="color-code" className={`${ainput} w-32`} value={colorCode} onChange={(e) => setColorCode(e.target.value)} placeholder={slugify(colorName) || 'navy'} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium" htmlFor="color-hex">
              Өнгө
            </label>
            <input id="color-hex" type="color" className="h-10 w-14 cursor-pointer rounded-lg border border-stone-300 bg-white p-1" value={colorHex} onChange={(e) => setColorHex(e.target.value)} />
          </div>
          <AButton type="submit" variant="secondary" disabled={colorAction.pending || colorName.trim().length < 2}>
            <Plus className="h-4 w-4" /> Өнгө нэмэх
          </AButton>
          <ActionFeedback error={colorAction.error} message={colorAction.message} className="w-full" />
        </form>
      )}
      {/* Size errors are shown inside the add-sizes form; success is confirmed here. */}
      <ActionFeedback error={null} message={sizeAction.message} />
    </div>
  )
}
