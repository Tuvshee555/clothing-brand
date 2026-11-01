'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { buttonClass } from '@/components/ui/button'
import { EmptyState, Spinner } from '@/components/ui/feedback'
import { availabilityOf, type CatalogProduct } from '@/lib/catalog-filter'
import { AVAILABILITY_LABELS } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import { productsBySlugsAction } from '@/server/actions/store'
import { useWishlist, WishlistButton } from './wishlist'

export function WishlistView() {
  const { items } = useWishlist()
  const [products, setProducts] = useState<CatalogProduct[] | null>(null)
  const key = items.join(',')

  useEffect(() => {
    let cancelled = false
    const slugs = key ? key.split(',') : []
    productsBySlugsAction(slugs).then((list) => {
      if (!cancelled) setProducts(list)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  if (products === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-stone-600">
        <Spinner /> Ачааллаж байна…
      </p>
    )
  }
  if (products.length === 0) {
    return (
      <EmptyState title="Хадгалсан бараа алга" action={<Link href="/shop" className={buttonClass('primary')}>Дэлгүүр үзэх</Link>}>
        Таалагдсан бараан дээрх зүрхэн тэмдгийг дарж хадгалаарай.
      </EmptyState>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 lg:grid-cols-4">
      {products.map((p) => {
        const availability = availabilityOf(p)
        return (
          <article key={p.id} className="relative">
            <Link href={`/products/${p.slug}`} className="block">
              <div className="relative aspect-[4/5] overflow-hidden bg-bone">
                {p.images[0] && <Image src={p.images[0].url} alt={p.images[0].alt} fill sizes="(min-width: 1024px) 24vw, 48vw" className="object-cover" />}
              </div>
            </Link>
            <WishlistButton slug={p.slug} name={p.name} className="absolute right-2.5 top-2.5" />
            <div className="mt-3 flex justify-between gap-3 text-[13.5px]">
              <Link href={`/products/${p.slug}`} className="hover:underline">
                {p.name}
              </Link>
              <span className="tabular shrink-0">{formatMoney(p.minPrice)}</span>
            </div>
            <p className="mt-1 text-[12px] text-stone-600">{AVAILABILITY_LABELS[availability]}</p>
          </article>
        )
      })}
    </div>
  )
}
