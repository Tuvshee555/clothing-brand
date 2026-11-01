'use client'

import { Minus, Plus, X, ZoomIn } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition, type MouseEvent as ReactMouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { AVAILABILITY_LABELS, MAX_LINE_QUANTITY, sizeLabel, variantAvailability } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { addToCartAction } from '@/server/actions/store'
import { useCartDrawer } from './cart-drawer'
import { WishlistButton } from './wishlist'

export interface ViewProduct {
  slug: string
  name: string
  basePrice: number
  colors: { id: string; code: string; name: string; hex: string }[]
  images: { id: string; url: string; alt: string; colorId: string | null }[]
  variants: { id: string; colorId: string; size: string; sku: string; price: number; isActive: boolean }[]
  sizes: string[]
}

export type LiveStock = Record<string, { stock: number; lowStockThreshold: number; isActive: boolean }>

function Lightbox({ images, index, onClose }: { images: ViewProduct['images']; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setCurrent((c) => (c + 1) % images.length)
      if (e.key === 'ArrowLeft') setCurrent((c) => (c - 1 + images.length) % images.length)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [images.length, onClose])
  const image = images[current]
  const move = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setZoom({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 })
  }
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label="Зураг томруулах">
      <div className="flex h-14 items-center justify-between px-4">
        <span className="tabular text-[12px] text-stone-600">
          {current + 1} / {images.length}
        </span>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label="Хаах" autoFocus>
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>
      <div
        className={cn('relative flex-1 overflow-hidden', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
        onClick={(e) => (zoom ? setZoom(null) : move(e))}
        onMouseMove={(e) => zoom && move(e)}
      >
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes="100vw"
          className="object-contain transition-transform duration-200"
          style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
      </div>
      {images.length > 1 && (
        <div className="flex justify-center gap-2 p-3">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setZoom(null)
                setCurrent(i)
              }}
              className={cn('relative h-16 w-13 border', i === current ? 'border-ink' : 'border-transparent opacity-70')}
              aria-label={`Зураг ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="52px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ProductView({
  product,
  stock,
  initialColor,
  info,
}: {
  product: ViewProduct
  stock: LiveStock
  initialColor?: string | null
  info: React.ReactNode
}) {
  const router = useRouter()
  const { open } = useCartDrawer()
  const firstAvailableColor =
    product.colors.find((c) => product.variants.some((v) => v.colorId === c.id && v.isActive && (stock[v.id]?.stock ?? 0) > 0)) ?? product.colors[0]
  const [colorId, setColorId] = useState(product.colors.find((c) => c.code === initialColor)?.id ?? firstAvailableColor?.id ?? '')
  const [size, setSize] = useState<string | null>(product.sizes.length === 1 ? product.sizes[0] : null)
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [pending, start] = useTransition()

  const color = product.colors.find((c) => c.id === colorId)
  const images = useMemo(() => {
    const own = product.images.filter((i) => i.colorId === colorId)
    const shared = product.images.filter((i) => !i.colorId)
    const list = [...own, ...shared]
    return list.length ? list : product.images
  }, [product.images, colorId])

  const variantFor = (s: string) => product.variants.find((v) => v.colorId === colorId && v.size === s)
  const variant = size ? variantFor(size) : undefined
  const live = variant ? stock[variant.id] : undefined
  const availability = variant && live ? variantAvailability({ ...live, isActive: live.isActive && variant.isActive }) : null
  const sellable = availability === 'in_stock' || availability === 'low_stock'
  const maxQty = live ? Math.min(live.stock, MAX_LINE_QUANTITY) : 1
  const prices = product.variants.filter((v) => v.isActive).map((v) => v.price)
  const minPrice = prices.length ? Math.min(...prices) : product.basePrice
  const maxPrice = prices.length ? Math.max(...prices) : product.basePrice

  const chooseColor = (id: string) => {
    setColorId(id)
    setError(null)
    setQty(1)
    const params = new URLSearchParams(window.location.search)
    const code = product.colors.find((c) => c.id === id)?.code
    if (code) params.set('color', code)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }

  const add = () => {
    if (!variant || !sellable) return
    setError(null)
    start(async () => {
      const res = await addToCartAction(variant.id, qty)
      if (res.ok) {
        open(res.data.cart, `«${product.name}» (${color?.name}, ${sizeLabel(variant.size)}) сагсанд нэмэгдлээ.`)
        setQty(1)
      } else {
        setError(res.error)
        router.refresh()
      }
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)] lg:gap-14">
      {/* Gallery */}
      <div>
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 lg:hidden">
          {images.map((img, i) => (
            <button key={img.id} type="button" onClick={() => setLightbox(i)} className="relative aspect-[4/5] w-full shrink-0 snap-center bg-bone" aria-label={`${img.alt} — томруулах`}>
              <Image src={img.url} alt={img.alt} fill sizes="100vw" priority={i === 0} className="object-cover" />
              <span className="tabular absolute bottom-3 right-3 bg-paper/85 px-2 py-0.5 text-[11px]">
                {i + 1} / {images.length}
              </span>
            </button>
          ))}
        </div>
        <div className="hidden grid-cols-2 gap-2 lg:grid">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(i)}
              className={cn('group relative aspect-[4/5] cursor-zoom-in overflow-hidden bg-bone', images.length % 2 === 1 && i === 0 && 'col-span-2 aspect-[5/4]')}
              aria-label={`${img.alt} — томруулах`}
            >
              <Image src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 30vw, 50vw" priority={i < 2} className="object-cover transition duration-700 group-hover:scale-[1.02]" />
              <ZoomIn className="absolute right-3 top-3 h-4 w-4 text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-stone-500">Демо: зураг нь лицензтэй стокийн гэрэл зураг бөгөөд үйлдвэрлэсэн бодит барааг харуулахгүй.</p>
      </div>

      {/* Buy panel */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-start justify-between gap-4">
          <h1 className="display text-[34px] leading-tight sm:text-[40px]">{product.name}</h1>
          <WishlistButton slug={product.slug} name={product.name} className="mt-1 shrink-0 border border-stone-300" />
        </div>
        <p className="tabular mt-3 text-xl">
          {variant ? formatMoney(variant.price) : minPrice === maxPrice ? formatMoney(minPrice) : `${formatMoney(minPrice)} – ${formatMoney(maxPrice)}`}
        </p>

        <div className="mt-8">
          <p className="text-[13px]">
            <span className="text-stone-600">Өнгө:</span> <span className="font-medium">{color?.name}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Өнгө сонгох">
            {product.colors.map((c) => {
              const anyStock = product.variants.some((v) => v.colorId === c.id && v.isActive && (stock[v.id]?.stock ?? 0) > 0)
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === colorId}
                  aria-label={`${c.name}${anyStock ? '' : ' — дууссан'}`}
                  title={c.name}
                  onClick={() => chooseColor(c.id)}
                  className={cn('relative h-9 w-9 p-[3px] transition', c.id === colorId ? 'ring-1 ring-ink' : 'ring-1 ring-stone-300 hover:ring-stone-500')}
                >
                  <span className="block h-full w-full border border-black/10" style={{ backgroundColor: c.hex }} />
                  {!anyStock && <span className="absolute inset-0 m-auto h-px w-[130%] -translate-x-[12%] rotate-45 bg-stone-500" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-7">
          <div className="flex items-center justify-between text-[13px]">
            <p>
              <span className="text-stone-600">Хэмжээ:</span> <span className="font-medium">{size ? sizeLabel(size) : 'сонгоно уу'}</span>
            </p>
            <a href="#size-guide" className="text-stone-600 underline underline-offset-4 hover:text-ink">
              Хэмжээний заавар
            </a>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Хэмжээ сонгох">
            {product.sizes.map((s) => {
              const v = variantFor(s)
              const st = v ? stock[v.id] : undefined
              const state = v && st ? variantAvailability({ ...st, isActive: st.isActive && v.isActive }) : 'unavailable'
              const out = state === 'out_of_stock' || state === 'unavailable'
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  aria-label={`${sizeLabel(s)} — ${AVAILABILITY_LABELS[state]}`}
                  onClick={() => {
                    setSize(s)
                    setQty(1)
                    setError(null)
                  }}
                  className={cn(
                    'relative h-11 border text-[13px] transition',
                    size === s ? 'border-ink bg-ink text-white' : 'border-stone-300 hover:border-ink',
                    out && size !== s && 'text-stone-400 line-through decoration-stone-400',
                  )}
                >
                  {sizeLabel(s)}
                  {state === 'low_stock' && size !== s && <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-accent" aria-hidden />}
                </button>
              )
            })}
          </div>
          <p className="mt-3 min-h-5 text-[13px]" aria-live="polite">
            {!size && <span className="text-stone-600">Хэмжээгээ сонгоход үлдэгдэл харагдана.</span>}
            {size && availability === 'in_stock' && (
              <span className="text-success">
                Бэлэн байгаа · үлдэгдэл <span className="tabular">{live?.stock}</span> ширхэг
              </span>
            )}
            {size && availability === 'low_stock' && (
              <span className="text-accent">
                Цөөн үлдсэн · ердөө <span className="tabular">{live?.stock}</span> ширхэг
              </span>
            )}
            {size && (availability === 'out_of_stock' || availability === 'unavailable' || !variant) && (
              <span className="text-danger">Энэ өнгө, хэмжээ одоогоор дууссан. Өөр хэмжээ, өнгө сонгоно уу.</span>
            )}
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <div className="flex h-13 items-center border border-stone-300">
            <button type="button" className="grid h-full w-11 place-items-center hover:bg-paper-2 disabled:opacity-30" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Тоог хасах">
              <Minus className="h-4 w-4" />
            </button>
            <span className="tabular w-8 text-center" aria-label="Тоо ширхэг" aria-live="polite">
              {qty}
            </span>
            <button
              type="button"
              className="grid h-full w-11 place-items-center hover:bg-paper-2 disabled:opacity-30"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={!sellable || qty >= maxQty}
              aria-label="Тоог нэмэх"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button size="lg" className="h-13 flex-1" onClick={add} disabled={!size || !sellable || pending}>
            {pending ? 'Нэмж байна…' : !size ? 'Хэмжээ сонгоно уу' : sellable ? 'Сагсанд нэмэх' : 'Дууссан'}
          </Button>
        </div>
        {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
        {variant && <p className="mt-3 text-[11.5px] text-stone-500">SKU: {variant.sku}</p>}

        <div className="mt-8 border-t border-stone-200">{info}</div>
      </div>

      {lightbox !== null && <Lightbox images={images} index={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
