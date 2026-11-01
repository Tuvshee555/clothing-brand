import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/feedback'
import { TAG_LABELS } from '@/lib/catalog'
import { facetsOf, filterCatalog } from '@/lib/catalog-filter'
import { parseCatalogParams, type RawParams } from '@/lib/catalog-params'
import { cn } from '@/lib/cn'
import { getCatalog, getNavigation } from '@/server/queries/catalog'
import { CatalogFilters } from './catalog-filters'
import { ProductGrid } from './product-card'

export interface CatalogPreset {
  category?: string
  collection?: string
  title: string
  eyebrow?: string
  description?: string | null
  /** For the category chip row. */
  activeCategory?: string
}

export async function CatalogView({ preset, params }: { preset: CatalogPreset; params: RawParams }) {
  const [catalog, nav] = await Promise.all([getCatalog(), getNavigation()])
  const filters = parseCatalogParams(params)
  const scope = filterCatalog(catalog, { category: preset.category, collection: preset.collection })
  const results = filterCatalog(scope, filters, TAG_LABELS)
  const facets = facetsOf(scope)
  // With one colour selected, each card opens on its matching colourway.
  const focusFamily = filters.colors?.length === 1 ? filters.colors[0] : undefined
  return (
    <div className="container-page pb-8 pt-10 sm:pt-14">
      <div className="max-w-2xl">
        {preset.eyebrow && <p className="eyebrow mb-3 text-stone-600">{preset.eyebrow}</p>}
        <h1 className="display text-[40px] sm:text-[56px]">{filters.q && !preset.category && !preset.collection ? `«${filters.q}»` : preset.title}</h1>
        {preset.description && <p className="mt-4 text-[15px] leading-relaxed text-stone-600">{preset.description}</p>}
      </div>

      {!preset.collection && (
        <nav className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Ангилал">
          <Link href="/shop" className={cn('shrink-0 border px-4 py-2 text-[12.5px]', !preset.activeCategory ? 'border-ink bg-ink text-white' : 'border-stone-300 hover:border-ink')}>
            Бүгд
          </Link>
          {nav.categories.map((c) => (
            <Link
              key={c.slug}
              href={`/shop/${c.slug}`}
              className={cn('shrink-0 border px-4 py-2 text-[12.5px]', preset.activeCategory === c.slug ? 'border-ink bg-ink text-white' : 'border-stone-300 hover:border-ink')}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-8 border-y border-stone-200 py-4">
        <CatalogFilters
          facets={facets}
          resultCount={results.length}
          state={{
            sizes: filters.sizes ?? [],
            colors: filters.colors ?? [],
            price: filters.price ?? null,
            inStockOnly: !!filters.inStockOnly,
            q: filters.q ?? null,
            sort: filters.sort,
          }}
        />
      </div>

      <p className="mb-6 mt-5 text-[12.5px] text-stone-600" role="status">
        {results.length} бараа
      </p>

      {results.length > 0 ? (
        <ProductGrid products={results} colorFamily={focusFamily} />
      ) : (
        <EmptyState
          title="Тохирох бараа олдсонгүй"
          action={
            <Link href={preset.category ? `/shop/${preset.category}` : preset.collection ? `/collections/${preset.collection}` : '/shop'} className={buttonClass('outline')}>
              Шүүлтүүрийг арилгах
            </Link>
          }
        >
          Шүүлтүүрээ багасгаж үзээрэй. Эсвэл туслахаас «L размерын хар hoodie байна уу?» гэх мэтээр асуугаарай.
        </EmptyState>
      )}
    </div>
  )
}

export function CatalogSkeleton() {
  return (
    <div className="container-page animate-pulse pb-8 pt-14">
      <div className="h-12 w-64 bg-paper-2" />
      <div className="mt-8 h-10 w-full bg-paper-2" />
      <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="aspect-[4/5] bg-paper-2" />
            <div className="mt-3 h-4 w-3/4 bg-paper-2" />
            <div className="mt-2 h-3 w-1/3 bg-paper-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
