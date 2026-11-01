import Image from 'next/image'
import Link from 'next/link'
import { PriceRange } from '@/components/money'
import { availabilityOf, colorFamily as familyOf, type CatalogProduct, type ColorFamily } from '@/lib/catalog-filter'
import { AVAILABILITY_LABELS } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { WishlistButton } from './wishlist'

export function ProductCard({
  product,
  priority = false,
  sizes = '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 48vw',
  colorFamily,
}: {
  product: CatalogProduct
  priority?: boolean
  sizes?: string
  /** Show the colourway of this family first (when the listing is filtered by one colour). */
  colorFamily?: ColorFamily
}) {
  const availability = availabilityOf(product)
  const preferredColor = colorFamily ? product.colors.find((c) => familyOf(c.hex) === colorFamily) : undefined
  const primary =
    (preferredColor && product.images.find((i) => i.colorId === preferredColor.id)) ?? product.images[0]
  const secondary = product.images.find((i) => i !== primary && (!primary?.colorId || i.colorId === primary.colorId || !i.colorId))
  const href = `/products/${product.slug}${preferredColor ? `?color=${preferredColor.code}` : ''}`
  const soldOut = availability === 'out_of_stock' || availability === 'unavailable'

  return (
    <article className="group relative">
      <Link href={href} className="block" aria-label={product.name}>
        <div className="relative aspect-[4/5] overflow-hidden bg-bone">
          {primary ? (
            <Image
              src={primary.url}
              alt={primary.alt}
              fill
              sizes={sizes}
              priority={priority}
              className={cn('object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]', soldOut && 'opacity-70 grayscale-[35%]')}
            />
          ) : (
            <div className="grid h-full place-items-center text-xs text-stone-500">Зураг байхгүй</div>
          )}
          {secondary && (
            <Image
              src={secondary.url}
              alt=""
              aria-hidden
              fill
              sizes={sizes}
              className="hidden object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 md:block"
            />
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
            {product.isNewArrival && !soldOut && <span className="bg-ink px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white">Шинэ</span>}
            {availability === 'low_stock' && (
              <span className="bg-paper px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-accent">Цөөн үлдсэн</span>
            )}
            {soldOut && (
              <span className="bg-paper px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-600">
                {AVAILABILITY_LABELS[availability]}
              </span>
            )}
          </div>
        </div>
      </Link>
      <WishlistButton slug={product.slug} name={product.name} className="absolute right-2.5 top-2.5" />
      <div className="mt-3 space-y-1 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[13.5px] leading-snug text-ink">
            <Link href={href} className="link-underline">
              {product.name}
            </Link>
          </h3>
          <PriceRange min={product.minPrice} max={product.maxPrice} className="shrink-0 text-[13.5px]" />
        </div>
        <div className="flex items-center gap-1.5">
          {product.colors.slice(0, 5).map((c) => (
            <span
              key={c.id}
              title={c.name}
              className="h-2.5 w-2.5 border border-stone-300"
              style={{ backgroundColor: c.hex }}
            />
          ))}
          {product.colors.length > 5 && <span className="text-[11px] text-stone-600">+{product.colors.length - 5}</span>}
          <span className="sr-only">Өнгө: {product.colors.map((c) => c.name).join(', ')}</span>
          <span className="ml-auto text-[11px] text-stone-600">{product.colors.length > 1 ? `${product.colors.length} өнгө` : product.categoryName}</span>
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ products, priorityCount = 4, colorFamily }: { products: CatalogProduct[]; priorityCount?: number; colorFamily?: ColorFamily }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} colorFamily={colorFamily} />
      ))}
    </div>
  )
}
