'use client'

import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { PRICE_BUCKETS, sizeLabel, SORT_OPTIONS, type SortKey } from '@/lib/catalog'
import { COLOR_FAMILIES, type ColorFamily } from '@/lib/catalog-filter'
import { catalogQuery } from '@/lib/catalog-params'
import { cn } from '@/lib/cn'

export interface FilterState {
  sizes: string[]
  colors: ColorFamily[]
  price: string | null
  inStockOnly: boolean
  q: string | null
  sort: SortKey
}

function useApply(state: FilterState) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, start] = useTransition()
  const apply = (patch: Partial<FilterState>) =>
    start(() => router.replace(`${pathname}${catalogQuery({ ...state, ...patch })}`, { scroll: false }))
  return { apply, pending }
}

function Dropdown({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('flex h-10 items-center gap-2 border px-4 text-[12.5px] transition', open || count ? 'border-ink' : 'border-stone-300 hover:border-ink')}
      >
        {label}
        {!!count && <span className="tabular bg-ink px-1.5 text-[10px] text-white">{count}</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="absolute left-0 top-full z-30 mt-1 min-w-56 border border-stone-300 bg-paper p-4 shadow-xl">{children}</div>}
    </div>
  )
}

function SizeOptions({ sizes, state, apply }: { sizes: string[]; state: FilterState; apply: (p: Partial<FilterState>) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {sizes.map((s) => {
        const on = state.sizes.includes(s)
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => apply({ sizes: on ? state.sizes.filter((x) => x !== s) : [...state.sizes, s] })}
            className={cn('h-9 border px-2 text-[12px]', on ? 'border-ink bg-ink text-white' : 'border-stone-300 hover:border-ink')}
          >
            {sizeLabel(s)}
          </button>
        )
      })}
    </div>
  )
}

function ColorOptions({ colors, state, apply }: { colors: ColorFamily[]; state: FilterState; apply: (p: Partial<FilterState>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {colors.map((c) => {
        const on = state.colors.includes(c)
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => apply({ colors: on ? state.colors.filter((x) => x !== c) : [...state.colors, c] })}
            className="flex items-center gap-2.5 px-1 py-1.5 text-left text-[13px] hover:bg-paper-2"
          >
            <span className="grid h-4 w-4 place-items-center border border-stone-400" style={{ backgroundColor: COLOR_FAMILIES[c].hex }}>
              {on && <Check className={cn('h-3 w-3', c === 'white' || c === 'beige' ? 'text-ink' : 'text-white')} />}
            </span>
            {COLOR_FAMILIES[c].label}
          </button>
        )
      })}
    </div>
  )
}

function PriceOptions({ state, apply }: { state: FilterState; apply: (p: Partial<FilterState>) => void }) {
  return (
    <div className="space-y-1">
      {PRICE_BUCKETS.map((b) => {
        const on = state.price === b.key
        return (
          <button
            key={b.key}
            type="button"
            aria-pressed={on}
            onClick={() => apply({ price: on ? null : b.key })}
            className={cn('flex w-full items-center justify-between px-1 py-1.5 text-left text-[13px] hover:bg-paper-2', on && 'font-medium')}
          >
            {b.label}
            {on && <Check className="h-3.5 w-3.5" />}
          </button>
        )
      })}
    </div>
  )
}

export function CatalogFilters({ facets, state, resultCount }: { facets: { sizes: string[]; colors: ColorFamily[] }; state: FilterState; resultCount: number }) {
  const { apply, pending } = useApply(state)
  const [sheet, setSheet] = useState(false)
  const activeCount = state.sizes.length + state.colors.length + (state.price ? 1 : 0) + (state.inStockOnly ? 1 : 0)
  const clear = () => apply({ sizes: [], colors: [], price: null, inStockOnly: false })

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...state.sizes.map((s) => ({ key: `s-${s}`, label: `Хэмжээ: ${sizeLabel(s)}`, remove: () => apply({ sizes: state.sizes.filter((x) => x !== s) }) })),
    ...state.colors.map((c) => ({ key: `c-${c}`, label: COLOR_FAMILIES[c].label, remove: () => apply({ colors: state.colors.filter((x) => x !== c) }) })),
    ...(state.price ? [{ key: 'p', label: PRICE_BUCKETS.find((b) => b.key === state.price)?.label ?? '', remove: () => apply({ price: null }) }] : []),
    ...(state.inStockOnly ? [{ key: 'st', label: 'Бэлэн байгаа', remove: () => apply({ inStockOnly: false }) }] : []),
    ...(state.q ? [{ key: 'q', label: `«${state.q}»`, remove: () => apply({ q: null }) }] : []),
  ]

  return (
    <div className={cn('transition-opacity', pending && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <Dropdown label="Хэмжээ" count={state.sizes.length}>
            <SizeOptions sizes={facets.sizes} state={state} apply={apply} />
          </Dropdown>
          <Dropdown label="Өнгө" count={state.colors.length}>
            <ColorOptions colors={facets.colors} state={state} apply={apply} />
          </Dropdown>
          <Dropdown label="Үнэ" count={state.price ? 1 : 0}>
            <PriceOptions state={state} apply={apply} />
          </Dropdown>
          <button
            type="button"
            aria-pressed={state.inStockOnly}
            onClick={() => apply({ inStockOnly: !state.inStockOnly })}
            className={cn('flex h-10 items-center gap-2 border px-4 text-[12.5px]', state.inStockOnly ? 'border-ink bg-ink text-white' : 'border-stone-300 hover:border-ink')}
          >
            Бэлэн байгаа
          </button>
        </div>
        <button type="button" onClick={() => setSheet(true)} className="flex h-10 items-center gap-2 border border-stone-300 px-4 text-[12.5px] md:hidden">
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} /> Шүүлтүүр {activeCount > 0 && `(${activeCount})`}
        </button>
        <label className="flex items-center gap-2 text-[12.5px]">
          <span className="hidden text-stone-600 sm:inline">Эрэмбэ</span>
          <select
            value={state.sort}
            onChange={(e) => apply({ sort: e.target.value as SortKey })}
            className="h-10 border border-stone-300 bg-paper px-3 text-[12.5px] hover:border-ink focus:border-ink focus:outline-none"
            aria-label="Эрэмбэлэх"
          >
            {Object.entries(SORT_OPTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.remove} className="flex items-center gap-1.5 bg-paper-2 px-3 py-1.5 text-[12px] hover:bg-bone">
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          {activeCount > 0 && (
            <button type="button" onClick={clear} className="px-2 text-[12px] text-stone-600 underline underline-offset-4 hover:text-ink">
              Бүгдийг арилгах
            </button>
          )}
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Шүүлтүүр">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setSheet(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto bg-paper">
            <div className="sticky top-0 flex h-14 items-center justify-between border-b border-stone-200 bg-paper px-5">
              <p className="eyebrow">Шүүлтүүр</p>
              <button type="button" onClick={() => setSheet(false)} className="grid h-10 w-10 place-items-center" aria-label="Хаах">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-7 px-5 py-6">
              <div>
                <p className="mb-3 text-sm font-medium">Хэмжээ</p>
                <SizeOptions sizes={facets.sizes} state={state} apply={apply} />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium">Өнгө</p>
                <ColorOptions colors={facets.colors} state={state} apply={apply} />
              </div>
              <div>
                <p className="mb-3 text-sm font-medium">Үнэ</p>
                <PriceOptions state={state} apply={apply} />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={state.inStockOnly} onChange={() => apply({ inStockOnly: !state.inStockOnly })} className="h-4 w-4 accent-ink" />
                Зөвхөн бэлэн байгаа бараа
              </label>
            </div>
            <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-stone-200 bg-paper p-4">
              <button type="button" onClick={clear} className="h-12 border border-ink text-[12px] uppercase tracking-[0.12em]">
                Арилгах
              </button>
              <button type="button" onClick={() => setSheet(false)} className="h-12 bg-ink text-[12px] uppercase tracking-[0.12em] text-white">
                {pending ? 'Шүүж байна…' : `${resultCount} бараа харах`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
