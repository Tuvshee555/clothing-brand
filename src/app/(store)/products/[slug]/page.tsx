import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ProductCard } from '@/components/store/product-card'
import { ProductView, type LiveStock } from '@/components/store/product-view'
import { RecentlyViewed } from '@/components/store/recently-viewed'
import { SizeGuideTable } from '@/components/store/size-guide-table'
import { BRAND } from '@/lib/brand'
import { AUDIENCE_LABELS, TAG_LABELS } from '@/lib/catalog'
import { availabilityOf, type CatalogProduct } from '@/lib/catalog-filter'
import { formatMoney } from '@/lib/money'
import { appUrl } from '@/server/app-url'
import { getCatalog, getProductDetail, getVariantStock, type ProductDetail } from '@/server/queries/catalog'
import { getStoreContent } from '@/server/queries/settings'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const BOTTOMS = new Set(['trousers', 'jeans'])

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = await getProductDetail(slug)
  if (!p) return { title: 'Бараа олдсонгүй' }
  const image = p.images[0]
  return {
    title: p.seoTitle ?? p.name,
    description: p.seoDescription ?? p.shortDescription,
    alternates: { canonical: `/products/${p.slug}` },
    openGraph: {
      title: `${p.name} — ${BRAND.name}`,
      description: p.shortDescription,
      images: image ? [{ url: image.url, alt: image.alt }] : undefined,
    },
  }
}

function related(product: ProductDetail, catalog: CatalogProduct[]): CatalogProduct[] {
  const score = (p: CatalogProduct) =>
    (p.categorySlug === product.categorySlug ? 3 : 0) + p.tags.filter((t) => product.tags.includes(t)).length + (p.audience === product.audience ? 1 : 0)
  return catalog
    .filter((p) => p.slug !== product.slug && availabilityOf(p) !== 'unavailable')
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 1)
    .sort((a, b) => b.s - a.s || a.p.sortOrder - b.p.sortOrder)
    .slice(0, 4)
    .map((x) => x.p)
}

function Section({ title, children, id, open = false }: { title: string; children: React.ReactNode; id?: string; open?: boolean }) {
  return (
    <details id={id} open={open} className="group border-b border-stone-200">
      <summary className="flex items-center justify-between py-4 text-[13px] font-medium uppercase tracking-[0.1em]">
        {title}
        <span className="text-lg font-light transition group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="pb-5 text-[14px] leading-relaxed text-charcoal">{children}</div>
    </details>
  )
}

async function ProductPageBody({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const product = await getProductDetail(slug)
  if (!product) notFound()
  const [stockRows, content, catalog] = await Promise.all([getVariantStock(product.id), getStoreContent(), getCatalog()])
  const stock: LiveStock = Object.fromEntries(stockRows.map((r) => [r.id, { stock: r.stock, lowStockThreshold: r.lowStockThreshold, isActive: r.isActive }]))
  const initialColor = typeof sp.color === 'string' ? sp.color : null
  const relatedProducts = related(product, catalog)
  const prices = product.variants.filter((v) => v.isActive).map((v) => v.price)
  const totalStock = stockRows.filter((r) => r.isActive).reduce((s, r) => s + r.stock, 0)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.images.slice(0, 4).map((i) => appUrl(i.url)),
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: BRAND.name },
    material: product.material,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'MNT',
      lowPrice: prices.length ? Math.min(...prices) : product.basePrice,
      highPrice: prices.length ? Math.max(...prices) : product.basePrice,
      offerCount: product.variants.length,
      availability: totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  }

  const info = (
    <>
      <Section title="Тайлбар" open>
        <p className="whitespace-pre-line">{product.description}</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {product.fit && (
            <>
              <dt className="text-stone-600">Хэлбэр</dt>
              <dd>{product.fit}</dd>
            </>
          )}
          <dt className="text-stone-600">Зориулалт</dt>
          <dd>{AUDIENCE_LABELS[product.audience]}</dd>
          {product.tags.length > 0 && (
            <>
              <dt className="text-stone-600">Онцлог</dt>
              <dd>{product.tags.map((t) => TAG_LABELS[t] ?? t).join(' · ')}</dd>
            </>
          )}
        </dl>
      </Section>
      <Section title="Материал ба арчилгаа">
        <p>
          <span className="text-stone-600">Материал:</span> {product.material}
        </p>
        <p className="mt-2">
          <span className="text-stone-600">Арчилгаа:</span> {product.care}
        </p>
      </Section>
      {!product.sizes.every((s) => s === 'ONE SIZE') && (
        <Section title="Хэмжээний заавар" id="size-guide">
          <SizeGuideTable guide={content.sizeGuide} kind={BOTTOMS.has(product.categorySlug) ? 'bottoms' : 'tops'} />
          <p className="mt-3 text-[12.5px] text-stone-600">{content.sizeGuide.note}</p>
          <Link href="/size-guide" className="mt-2 inline-block text-[12.5px] underline underline-offset-4">
            Бүтэн хүснэгт
          </Link>
        </Section>
      )}
      <Section title="Хүргэлт">
        <ul className="space-y-2">
          {content.shipping.map((s) => (
            <li key={s.code}>
              <span className="font-medium">{s.name}</span> — {s.fee === 0 ? 'үнэгүй' : formatMoney(s.fee)}
              {s.freeThreshold ? ` (${formatMoney(s.freeThreshold)}-өөс дээш үнэгүй)` : ''}, {s.eta}
            </li>
          ))}
        </ul>
        <Link href="/help/delivery" className="mt-3 inline-block text-[12.5px] underline underline-offset-4">
          Хүргэлтийн нөхцөл
        </Link>
      </Section>
      <Section title="Буцаалт ба солилт">
        <p>14 хоногийн дотор өмсөөгүй, шошготой барааг буцаах эсвэл хэмжээг нэг удаа үнэгүй солих боломжтой.</p>
        <div className="mt-3 flex gap-4 text-[12.5px]">
          <Link href="/help/returns" className="underline underline-offset-4">
            Буцаалт
          </Link>
          <Link href="/help/exchange" className="underline underline-offset-4">
            Хэмжээ солих
          </Link>
        </div>
      </Section>
    </>
  )

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="container-page pt-6 sm:pt-8">
        <nav aria-label="Байршил" className="mb-6 flex flex-wrap items-center gap-1.5 text-[12px] text-stone-600">
          <Link href="/" className="hover:text-ink">
            Нүүр
          </Link>
          <span aria-hidden>/</span>
          <Link href={`/shop/${product.categorySlug}`} className="hover:text-ink">
            {product.categoryName}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink" aria-current="page">
            {product.name}
          </span>
        </nav>
        <ProductView
          product={{ slug: product.slug, name: product.name, basePrice: product.basePrice, colors: product.colors, images: product.images, variants: product.variants, sizes: product.sizes }}
          stock={stock}
          initialColor={initialColor}
          info={info}
        />
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-stone-600 lg:hidden">{product.shortDescription}</p>
      </div>

      {relatedProducts.length > 0 && (
        <section className="container-page pt-24" aria-labelledby="related-heading">
          <h2 id="related-heading" className="display mb-8 text-[30px] sm:text-[36px]">
            Хослуулж өмсөх
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 lg:grid-cols-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
      <RecentlyViewed currentSlug={product.slug} />
    </>
  )
}

function ProductSkeleton() {
  return (
    <div className="container-page grid animate-pulse gap-8 pt-14 lg:grid-cols-[1.45fr_1fr] lg:gap-14">
      <div className="grid grid-cols-2 gap-2">
        <div className="aspect-[4/5] bg-paper-2" />
        <div className="aspect-[4/5] bg-paper-2" />
      </div>
      <div className="space-y-4">
        <div className="h-10 w-3/4 bg-paper-2" />
        <div className="h-6 w-1/3 bg-paper-2" />
        <div className="h-24 w-full bg-paper-2" />
        <div className="h-13 w-full bg-paper-2" />
      </div>
    </div>
  )
}

export default function ProductPage(props: Props) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductPageBody {...props} />
    </Suspense>
  )
}
