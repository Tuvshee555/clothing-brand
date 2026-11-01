'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CatalogProduct } from '@/lib/catalog-filter'
import { formatMoney } from '@/lib/money'
import { productsBySlugsAction } from '@/server/actions/store'

const KEY = 'manan.recent'

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Records the current product and shows the visitor's other recently viewed products (data from the database). */
export function RecentlyViewed({ currentSlug }: { currentSlug: string }) {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  useEffect(() => {
    const previous = readRecent().filter((s) => s !== currentSlug)
    try {
      localStorage.setItem(KEY, JSON.stringify([currentSlug, ...previous].slice(0, 12)))
    } catch {
      // Storage unavailable: nothing to remember.
    }
    if (previous.length === 0) return
    let cancelled = false
    productsBySlugsAction(previous.slice(0, 6)).then((list) => {
      if (!cancelled) setProducts(list)
    })
    return () => {
      cancelled = true
    }
  }, [currentSlug])
  if (products.length === 0) return null
  return (
    <section className="container-page pt-20" aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="display mb-6 text-[28px]">
        Саяхан үзсэн
      </h2>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {products.map((p) => (
          <Link key={p.id} href={`/products/${p.slug}`} className="group w-36 shrink-0 sm:w-44">
            <div className="relative aspect-[4/5] overflow-hidden bg-bone">
              {p.images[0] && <Image src={p.images[0].url} alt={p.images[0].alt} fill sizes="176px" className="object-cover transition duration-500 group-hover:scale-[1.03]" />}
            </div>
            <p className="mt-2 line-clamp-1 text-[12.5px] group-hover:underline">{p.name}</p>
            <p className="tabular text-[12px] text-stone-600">{formatMoney(p.minPrice)}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
