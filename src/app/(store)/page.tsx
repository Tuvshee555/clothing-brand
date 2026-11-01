import { ArrowRight, MessageCircle, Repeat2, Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ProductCard } from '@/components/store/product-card'
import { buttonClass } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import type { CatalogProduct } from '@/lib/catalog-filter'
import { EDITORIAL } from '@/lib/editorial'
import { formatMoney } from '@/lib/money'
import { getBestsellerIds, getCatalog, getNavigation } from '@/server/queries/catalog'
import { getStoreContent } from '@/server/queries/settings'

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
  description: 'Ноолуур, нягт хөвөн, цэвэр зүсэлттэй өдөр тутмын тансаг хувцас. Хэмжээ, өнгө тус бүрийн үлдэгдэл бодит цагт. (Портфолио демо)',
  alternates: { canonical: '/' },
}

function SectionHeading({ eyebrow, title, href, linkLabel }: { eyebrow?: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div>
        {eyebrow && <p className="eyebrow mb-2 text-stone-600">{eyebrow}</p>}
        <h2 className="display text-[30px] sm:text-[40px]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="link-underline hidden shrink-0 items-center gap-1.5 pb-1 text-[12px] uppercase tracking-[0.12em] sm:inline-flex">
          {linkLabel ?? 'Бүгдийг үзэх'} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

function ProductRow({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {products.map((p) => (
        <div key={p.id} className="w-[68%] shrink-0 snap-start sm:w-auto">
          <ProductCard product={p} sizes="(min-width: 1024px) 24vw, (min-width: 640px) 48vw, 68vw" />
        </div>
      ))}
    </div>
  )
}

export default async function HomePage() {
  const [catalog, nav, bestIds, content] = await Promise.all([getCatalog(), getNavigation(), getBestsellerIds(8), getStoreContent()])
  const newArrivals = [...catalog]
    .filter((p) => p.isNewArrival)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, 4)
  const bestsellers = bestIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is CatalogProduct => !!p)
    .slice(0, 4)
  const essentials = catalog.filter((p) => p.collectionSlugs.includes('essentials')).slice(0, 3)
  const featured = nav.collections.filter((c) => c.isFeatured).slice(0, 3)
  const freeFrom = content.shipping.find((s) => s.region === 'ub' && s.freeThreshold)?.freeThreshold

  return (
    <>
      {/* Hero */}
      <section className="relative">
        <div className="grid h-[calc(100svh-6.25rem)] max-h-[880px] min-h-[540px] grid-cols-1 md:grid-cols-2">
          <div className="relative hidden md:block">
            <Image src={EDITORIAL.heroLeft.src} alt={EDITORIAL.heroLeft.alt} fill priority sizes="50vw" className="object-cover" />
          </div>
          <div className="relative">
            <Image src={EDITORIAL.heroRight.src} alt={EDITORIAL.heroRight.alt} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/10 to-transparent md:from-ink/55 md:via-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="container-page pb-10 sm:pb-14">
            <p className="eyebrow animate-rise text-white/85">Намар — Өвөл 2026</p>
            <h1 className="display mt-3 max-w-3xl animate-rise text-[44px] text-white [animation-delay:80ms] sm:text-[64px] lg:text-[84px]">{BRAND.tagline}</h1>
            <p className="mt-4 max-w-md animate-rise text-[15px] leading-relaxed text-white/85 [animation-delay:160ms]">
              Зөөлөн ноолуур, нягт хөвөн, цэвэр зүсэлт. Хотын хэмнэлд зориулсан, удаан эдэлгээтэй өдөр тутмын хувцас.
            </p>
            <div className="mt-7 flex animate-rise flex-wrap gap-3 [animation-delay:240ms]">
              <Link href="/collections/new" className={buttonClass('light', 'lg')}>
                Шинэ ирэлт үзэх
              </Link>
              <Link href="/collections/winter-edit" className={buttonClass('outline', 'lg', 'border-white text-white hover:bg-white hover:text-ink')}>
                Өвлийн цуглуулга
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Service strip */}
      <section className="border-b border-stone-200 bg-paper-2">
        <div className="container-page grid gap-4 py-5 text-[13px] text-charcoal sm:grid-cols-3">
          <p className="flex items-center gap-3">
            <Truck className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {freeFrom ? `Улаанбаатарт ${formatMoney(freeFrom)}-өөс дээш үнэгүй хүргэлт` : 'Улаанбаатар, орон нутагт хүргэлттэй'}
          </p>
          <p className="flex items-center gap-3">
            <Repeat2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            14 хоногийн дотор хэмжээ солих боломжтой
          </p>
          <p className="flex items-center gap-3">
            <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            Туслах хэмжээ, үлдэгдлийг сангаас шууд шалгана
          </p>
        </div>
      </section>

      {/* New arrivals */}
      {newArrivals.length > 0 && (
        <section className="container-page pt-20">
          <SectionHeading eyebrow="Шинэ ирэлт" title="Энэ улирлын шинэ загварууд" href="/collections/new" />
          <ProductRow products={newArrivals} />
        </section>
      )}

      {/* Featured collections */}
      {featured.length > 0 && (
        <section className="container-page pt-24">
          <SectionHeading eyebrow="Цуглуулга" title="Онцлох цуглуулгууд" />
          <div className="grid gap-4 md:grid-cols-3">
            {featured.map((c, i) => (
              <Link key={c.slug} href={`/collections/${c.slug}`} className="group relative block aspect-[4/5] overflow-hidden bg-bone md:aspect-[3/4]">
                {c.imageUrl && (
                  <Image src={c.imageUrl} alt={c.name} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-[900ms] ease-out group-hover:scale-[1.04]" priority={i === 0} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  {c.eyebrow && <p className="eyebrow text-white/80">{c.eyebrow}</p>}
                  <p className="display mt-1 text-3xl">{c.name}</p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em] text-white/90">
                    Үзэх <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Best sellers */}
      {bestsellers.length > 0 && (
        <section className="container-page pt-24">
          <SectionHeading eyebrow="Их захиалагддаг" title="Хамгийн их сонгогддог" href="/shop" />
          <ProductRow products={bestsellers} />
          <p className="mt-6 text-[12px] text-stone-600">Демо: эрэмбэ нь сангийн жишээ захиалгад тулгуурласан.</p>
        </section>
      )}

      {/* Campaign */}
      <section className="mt-24 bg-ink text-white">
        <div className="grid lg:grid-cols-[1.35fr_1fr]">
          <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[640px]">
            <Image src={EDITORIAL.winterWide.src} alt={EDITORIAL.winterWide.alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
          </div>
          <div className="flex flex-col justify-between gap-10 p-8 sm:p-12 lg:p-16">
            <div>
              <p className="eyebrow text-white/60">Кампанит ажил · Өвөл 2026</p>
              <h2 className="display mt-4 text-[38px] sm:text-[52px]">Цасан дундах чимээгүй</h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
                Хасах 30 хэмд ч өөрийн дүр төрхөө алдахгүй. Давхар нэхмэл ноос, нягт дулаалга, хүзүү нөмрөх ороолт — Улаанбаатарын өвөлд зориулсан цуглуулга.
              </p>
              <Link href="/collections/winter-edit" className={buttonClass('light', 'lg', 'mt-8')}>
                Өвлийн цуглуулга
              </Link>
            </div>
            <div className="relative ml-auto hidden aspect-[4/5] w-56 sm:block">
              <Image src={EDITORIAL.winterPortrait.src} alt={EDITORIAL.winterPortrait.alt} fill sizes="224px" className="object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Women / Men */}
      <section className="container-page grid gap-4 pt-24 md:grid-cols-2">
        {[
          { href: '/collections/women', label: 'Эмэгтэй', image: EDITORIAL.women },
          { href: '/collections/men', label: 'Эрэгтэй', image: EDITORIAL.men },
        ].map((tile) => (
          <Link key={tile.href} href={tile.href} className="group relative block aspect-[4/5] overflow-hidden bg-bone sm:aspect-[5/6]">
            <Image src={tile.image.src} alt={tile.image.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover transition duration-[900ms] ease-out group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/45 to-transparent" />
            <div className="absolute bottom-0 left-0 flex w-full items-end justify-between p-6 text-white sm:p-8">
              <p className="display text-4xl sm:text-5xl">{tile.label}</p>
              <span className="eyebrow inline-flex items-center gap-1.5">
                Дэлгүүр <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* Essentials promotion */}
      {essentials.length > 0 && (
        <section className="container-page pt-24">
          <div className="grid gap-8 border border-stone-200 bg-white p-5 sm:p-8 lg:grid-cols-[0.9fr_1.6fr] lg:gap-12">
            <div className="flex flex-col justify-between gap-8">
              <div>
                <p className="eyebrow text-stone-600">Суурь хувцас</p>
                <h2 className="display mt-3 text-[34px] sm:text-[44px]">Давхарлаж өмсөх үндэс</h2>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-stone-600">
                  Өдөр бүр өмсөх, хоорондоо зохицох суурь бараанууд. Үнэ нь байнгын — хуурамч хямдрал, «хуучин үнэ» байхгүй.
                </p>
              </div>
              <Link href="/collections/essentials" className={buttonClass('primary', 'md', 'self-start')}>
                Суурь хувцас үзэх
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {essentials.map((p) => (
                <ProductCard key={p.id} product={p} sizes="(min-width: 1024px) 18vw, 45vw" />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Brand story */}
      <section className="container-page pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div className="relative aspect-[4/5] bg-bone lg:aspect-[5/6]">
            <Image src={EDITORIAL.story.src} alt={EDITORIAL.story.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          </div>
          <div className="max-w-lg">
            <p className="eyebrow text-stone-600">Брэндийн түүх</p>
            <h2 className="display mt-3 text-[34px] sm:text-[48px]">Манан шиг зөөлөн, чимээгүй</h2>
            <div className="prose-store mt-6 text-[15px] leading-relaxed text-charcoal">
              <p>
                {BRAND.name} гэдэг нь «манан» — өглөөний хотыг бүрхэх зөөлөн, саарал туяа. Бид чанга лого, түр зуурын моодоос илүү материал, зүсэлт,
                өдөр бүр өмсөхөд таатай байдлыг эрхэмлэдэг.
              </p>
              <p>Цөөн, гэхдээ сайн. Хоорондоо зохицох өнгө, удаан эдэлгээтэй даавуу, шударга үнэ.</p>
            </div>
            <Link href="/about" className="link-underline mt-8 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.12em]">
              Брэндийн тухай <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <p className="mt-10 border-t border-stone-200 pt-5 text-[12px] leading-relaxed text-stone-600">
              Анхааруулга: {BRAND.name} бол {BRAND.agencyName}-ын бүтээсэн зохиомол брэнд. Бүтээгдэхүүн, үнэ, үлдэгдэл жишээ өгөгдөл бөгөөд зурагнууд
              лицензтэй стокийн гэрэл зураг.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
