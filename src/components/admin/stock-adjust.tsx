'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { STOCK_REASON_OPTIONS, type StockReason } from '@/lib/inventory'
import { adjustStockAction } from '@/server/actions/admin'
import { AButton, ainput } from './ui'
import { useAdminAction } from './use-admin-action'

/** Inline stock adjustment: add/remove units or set an exact count, always with a reason. */
export function StockAdjust({ variantId, stock, disabled, label }: { variantId: string; stock: number; disabled?: boolean; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'delta' | 'set'>('delta')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState<StockReason>('restock')
  const [note, setNote] = useState('')
  const { pending, error, fieldErrors, run } = useAdminAction()
  if (!open) {
    return (
      <AButton size="sm" variant="secondary" disabled={disabled} onClick={() => setOpen(true)} title={disabled ? 'Демо горимд үлдэгдэл засах боломжгүй' : undefined} aria-label={`${label} — үлдэгдэл засах`}>
        Засах
      </AButton>
    )
  }
  const n = Number(value)
  const preview = Number.isInteger(n) && value !== '' ? (mode === 'set' ? n : stock + n) : null
  return (
    <form
      className="w-72 space-y-2 rounded-lg border border-stone-300 bg-white p-3 text-left shadow-lg"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => adjustStockAction({ variantId, mode, value: n, reason, note: note || null }), undefined, () => {
          setOpen(false)
          setValue('')
          setNote('')
          router.refresh()
        })
      }}
    >
      <p className="text-[12.5px] font-medium">{label}</p>
      <div className="flex gap-1 rounded-lg bg-paper-2 p-0.5 text-[12px]">
        {(
          [
            ['delta', 'Нэмэх / хасах'],
            ['set', 'Тоолж тохируулах'],
          ] as const
        ).map(([m, l]) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded-md px-2 py-1 ${mode === m ? 'bg-white shadow-sm' : ''}`}>
            {l}
          </button>
        ))}
      </div>
      <input
        autoFocus
        inputMode="numeric"
        className={ainput}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))}
        placeholder={mode === 'delta' ? 'Жишээ: 10 эсвэл -2' : 'Шинэ үлдэгдэл'}
        aria-label="Тоо"
        aria-invalid={!!fieldErrors.value}
      />
      {fieldErrors.value && <p className="text-[12px] text-danger">{fieldErrors.value}</p>}
      <select className={ainput} value={reason} onChange={(e) => setReason(e.target.value as StockReason)} aria-label="Шалтгаан">
        {STOCK_REASON_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input className={ainput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Тэмдэглэл (заавал биш)" maxLength={200} aria-label="Тэмдэглэл" />
      <p className="text-[12px] text-stone-600">
        Одоо: <span className="tabular">{stock}</span>
        {preview !== null && (
          <>
            {' '}
            → <span className={`tabular font-medium ${preview < 0 ? 'text-danger' : ''}`}>{preview}</span>
          </>
        )}
      </p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <AButton type="submit" size="sm" disabled={pending || value === '' || value === '-'}>
          {pending ? 'Хадгалж байна…' : 'Хадгалах'}
        </AButton>
        <AButton size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Болих
        </AButton>
      </div>
    </form>
  )
}
