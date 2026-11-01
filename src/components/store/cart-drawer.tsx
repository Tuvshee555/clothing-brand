'use client'

import { Minus, Plus, ShoppingBag, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { createContext, use, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { buttonClass } from '@/components/ui/button'
import { Alert, Spinner } from '@/components/ui/feedback'
import { MAX_LINE_QUANTITY } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { loadCartAction, updateCartAction } from '@/server/actions/store'
import type { CartView } from '@/server/services/cart'

type CartContextValue = { open: (cart?: CartView, note?: string) => void; close: () => void }
const CartContext = createContext<CartContextValue | null>(null)

export function useCartDrawer() {
  const ctx = use(CartContext)
  if (!ctx) throw new Error('useCartDrawer must be used inside <CartProvider>')
  return ctx
}

export function CartProvider({ children, freeShippingThreshold }: { children: ReactNode; freeShippingThreshold: number | null }) {
  const [isOpen, setOpen] = useState(false)
  const [cart, setCart] = useState<CartView | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [updating, startUpdating] = useTransition()
  const closeRef = useRef<HTMLButtonElement>(null)

  const open = useCallback((next?: CartView, message?: string) => {
    setOpen(true)
    setError(null)
    setNote(message ?? null)
    if (next) setCart(next)
    else startLoading(async () => setCart(await loadCartAction()))
  }, [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const change = (itemId: string, quantity: number) =>
    startUpdating(async () => {
      setError(null)
      const res = await updateCartAction(itemId, quantity)
      if (res.ok) setCart(res.data.cart)
      else setError(res.error)
    })

  const remaining = freeShippingThreshold !== null && cart ? Math.max(0, freeShippingThreshold - cart.subtotal) : null

  return (
    <CartContext value={{ open, close }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={close} aria-hidden />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in flex-col bg-paper shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
              <h2 id="cart-drawer-title" className="eyebrow text-ink">
                Сагс {cart ? `(${cart.itemCount})` : ''}
              </h2>
              <button ref={closeRef} type="button" onClick={close} className="grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label="Сагс хаах">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {note && <Alert tone="success" className="mb-4">{note}</Alert>}
              {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
              {loading && !cart && (
                <div className="flex items-center gap-2 py-10 text-sm text-stone-600">
                  <Spinner /> Сагсыг ачааллаж байна…
                </div>
              )}
              {cart && cart.lines.length === 0 && (
                <div className="py-16 text-center">
                  <ShoppingBag className="mx-auto h-8 w-8 text-stone-400" strokeWidth={1.2} />
                  <p className="display mt-4 text-2xl">Таны сагс хоосон байна</p>
                  <Link href="/shop" onClick={close} className={buttonClass('outline', 'md', 'mt-6')}>
                    Дэлгүүр үзэх
                  </Link>
                </div>
              )}
              <ul className={cn('divide-y divide-stone-200', updating && 'opacity-60')}>
                {cart?.lines.map((line) => (
                  <li key={line.itemId} className="flex gap-4 py-4">
                    <Link href={`/products/${line.productSlug}`} onClick={close} className="relative aspect-[4/5] w-20 shrink-0 bg-bone">
                      {line.imageUrl && <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="80px" className="object-cover" />}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex justify-between gap-3">
                        <Link href={`/products/${line.productSlug}`} onClick={close} className="text-sm leading-snug hover:underline">
                          {line.productName}
                        </Link>
                        <span className="tabular shrink-0 text-sm">{formatMoney(line.lineTotal)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {line.colorName} · {line.sizeLabel} · {formatMoney(line.unitPrice)}
                      </p>
                      {line.problem && <p className="mt-1 text-xs font-medium text-danger">{line.problem}</p>}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex items-center border border-stone-300">
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center hover:bg-paper-2 disabled:opacity-40"
                            onClick={() => change(line.itemId, line.quantity - 1)}
                            disabled={updating}
                            aria-label="Тоог хасах"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="tabular w-8 text-center text-sm" aria-live="polite">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center hover:bg-paper-2 disabled:opacity-40"
                            onClick={() => change(line.itemId, line.quantity + 1)}
                            disabled={updating || line.quantity >= Math.min(line.stock, MAX_LINE_QUANTITY)}
                            aria-label="Тоог нэмэх"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button type="button" onClick={() => change(line.itemId, 0)} className="text-xs text-stone-600 underline underline-offset-4 hover:text-ink" disabled={updating}>
                          Хасах
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {cart && cart.lines.length > 0 && (
              <div className="border-t border-stone-200 px-5 py-5">
                {remaining !== null && (
                  <p className="mb-3 text-xs text-stone-600">
                    {remaining > 0 ? (
                      <>
                        Улаанбаатарт үнэгүй хүргэлт хүртэл <span className="font-medium text-ink">{formatMoney(remaining)}</span> дутуу.
                      </>
                    ) : (
                      'Улаанбаатарт энгийн хүргэлт үнэгүй.'
                    )}
                  </p>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm">Барааны дүн</span>
                  <span className="tabular text-lg">{formatMoney(cart.subtotal)}</span>
                </div>
                <p className="mt-1 text-xs text-stone-600">Хүргэлтийн төлбөрийг захиалах үед тооцно.</p>
                <div className="mt-4 grid gap-2">
                  <Link
                    href="/checkout"
                    onClick={close}
                    aria-disabled={cart.hasProblems}
                    className={buttonClass('primary', 'lg', cn('w-full', cart.hasProblems && 'pointer-events-none'))}
                  >
                    Захиалах
                  </Link>
                  <Link href="/cart" onClick={close} className={buttonClass('outline', 'md', 'w-full')}>
                    Сагс харах
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </CartContext>
  )
}

export function CartButton({ count }: { count: number }) {
  const { open } = useCartDrawer()
  return (
    <button type="button" onClick={() => open()} className="relative grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label={`Сагс, ${count} бараа`}>
      <ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.5} />
      {count > 0 && (
        <span className="tabular absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center bg-ink px-1 text-[10px] font-medium text-white">
          {count}
        </span>
      )}
    </button>
  )
}
