'use client'

import { Minus, Plus } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Alert } from '@/components/ui/feedback'
import { MAX_LINE_QUANTITY } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { updateCartAction } from '@/server/actions/store'
import type { CartLine } from '@/server/services/cart'

export function CartLines({ lines }: { lines: CartLine[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const change = (itemId: string, quantity: number) =>
    start(async () => {
      setError(null)
      const res = await updateCartAction(itemId, quantity)
      if (!res.ok) setError(res.error)
    })
  return (
    <div>
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      <ul className={cn('divide-y divide-stone-200 border-y border-stone-200', pending && 'opacity-60')}>
        {lines.map((line) => (
          <li key={line.itemId} className="flex gap-4 py-5 sm:gap-6">
            <Link href={`/products/${line.productSlug}`} className="relative aspect-[4/5] w-24 shrink-0 bg-bone sm:w-28">
              {line.imageUrl && <Image src={line.imageUrl} alt={line.imageAlt} fill sizes="112px" className="object-cover" />}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex justify-between gap-4">
                <div>
                  <Link href={`/products/${line.productSlug}`} className="text-[15px] hover:underline">
                    {line.productName}
                  </Link>
                  <p className="mt-1 text-[13px] text-stone-600">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 border border-stone-300 align-middle" style={{ backgroundColor: line.colorHex }} />
                    {line.colorName} · {line.sizeLabel}
                  </p>
                  <p className="tabular mt-1 text-[13px] text-stone-600">Нэгж үнэ {formatMoney(line.unitPrice)}</p>
                </div>
                <p className="tabular shrink-0 text-[15px]">{formatMoney(line.lineTotal)}</p>
              </div>
              {line.problem && <p className="mt-2 text-[13px] font-medium text-danger">{line.problem}</p>}
              <div className="mt-auto flex items-center justify-between pt-3">
                <div className="flex items-center border border-stone-300">
                  <button type="button" className="grid h-9 w-9 place-items-center hover:bg-paper-2 disabled:opacity-30" onClick={() => change(line.itemId, line.quantity - 1)} disabled={pending} aria-label="Тоог хасах">
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular w-9 text-center text-sm">{line.quantity}</span>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center hover:bg-paper-2 disabled:opacity-30"
                    onClick={() => change(line.itemId, line.quantity + 1)}
                    disabled={pending || line.quantity >= Math.min(line.stock, MAX_LINE_QUANTITY)}
                    aria-label="Тоог нэмэх"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => change(line.itemId, 0)} disabled={pending} className="text-[13px] text-stone-600 underline underline-offset-4 hover:text-ink">
                  Хасах
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
