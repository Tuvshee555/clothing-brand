import { ArrowUpRight, Heart, UserRound } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { BRAND } from '@/lib/brand'
import { db } from '@/server/db'
import { getNavigation } from '@/server/queries/catalog'
import { getStoreContent } from '@/server/queries/settings'
import { getCartCount } from '@/server/services/cart'
import { readVisitorKey } from '@/server/visitor'
import { CartButton } from './cart-drawer'
import { MobileMenu, SearchButton } from './header-client'
import { WishlistCount } from './wishlist'

export async function AnnouncementBar() {
  const { info } = await getStoreContent()
  return (
    <div className="bg-ink text-white">
      <div className="container-page flex h-9 items-center justify-center gap-6 text-[11.5px] tracking-[0.04em] sm:justify-between">
        <span className="hidden text-white/60 sm:inline">Портфолио демо — зохиомол брэнд</span>
        <p className="truncate text-center">{info.announcementEnabled ? info.announcement : 'Демо дэлгүүр — бодит худалдаа, төлбөр хийгдэхгүй'}</p>
        <a href={BRAND.portfolioUrl} className="hidden items-center gap-1 text-white/70 transition hover:text-white sm:inline-flex">
          {BRAND.agencyName} <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

async function CartCount() {
  const count = await getCartCount(db, await readVisitorKey())
  return <CartButton count={count} />
}

export async function Header() {
  const nav = await getNavigation()
  const featured = nav.collections.find((c) => c.slug === 'winter-edit') ?? nav.collections[0]
  const navLink = 'link-underline py-1 text-[12.5px] uppercase tracking-[0.12em]'
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-paper/95 backdrop-blur-md">
      <div className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-1">
          <MobileMenu categories={nav.categories} collections={nav.collections} />
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Үндсэн цэс">
            <Link href="/collections/new" className={navLink}>
              Шинэ
            </Link>
            <Link href="/collections/women" className={navLink}>
              Эмэгтэй
            </Link>
            <Link href="/collections/men" className={navLink}>
              Эрэгтэй
            </Link>
            <div className="group flex h-16 items-center">
              <Link href="/shop" className={navLink} aria-haspopup="true">
                Дэлгүүр
              </Link>
              <div className="invisible absolute inset-x-0 top-full border-b border-stone-200 bg-paper opacity-0 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.35)] transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="container-page grid grid-cols-[1fr_1fr_1.2fr] gap-10 py-10">
                  <div>
                    <p className="eyebrow mb-4 text-stone-600">Ангилал</p>
                    <ul className="space-y-2.5">
                      {nav.categories.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/shop/${c.slug}`} className="link-underline text-[15px]">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                      <li>
                        <Link href="/shop" className="link-underline text-[15px] font-medium">
                          Бүх бараа
                        </Link>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <p className="eyebrow mb-4 text-stone-600">Цуглуулга</p>
                    <ul className="space-y-2.5">
                      {nav.collections.map((c) => (
                        <li key={c.slug}>
                          <Link href={`/collections/${c.slug}`} className="link-underline text-[15px]">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {featured?.imageUrl && (
                    <Link href={`/collections/${featured.slug}`} className="group/feature relative block aspect-[16/10] overflow-hidden bg-bone">
                      <Image src={featured.imageUrl} alt={featured.name} fill sizes="30vw" className="object-cover transition duration-700 group-hover/feature:scale-[1.03]" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/60 to-transparent p-5 text-white">
                        <span className="eyebrow block text-white/80">{featured.eyebrow}</span>
                        <span className="display mt-1 block text-2xl">{featured.name}</span>
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <Link href="/about" className={navLink}>
              Брэнд
            </Link>
          </nav>
        </div>

        <Link href="/" className="wordmark pl-[0.42em] text-[19px] sm:text-[21px]" aria-label={`${BRAND.name} нүүр хуудас`}>
          {BRAND.name}
        </Link>

        <div className="flex items-center justify-end">
          <SearchButton />
          <Link href="/orders" className="hidden h-10 w-10 place-items-center hover:bg-paper-2 sm:grid" aria-label="Миний захиалга">
            <UserRound className="h-[19px] w-[19px]" strokeWidth={1.5} />
          </Link>
          <Link href="/wishlist" className="relative hidden h-10 w-10 place-items-center hover:bg-paper-2 sm:grid" aria-label="Хадгалсан бараа">
            <Heart className="h-[19px] w-[19px]" strokeWidth={1.5} />
            <WishlistCount />
          </Link>
          <Suspense fallback={<CartButton count={0} />}>
            <CartCount />
          </Suspense>
        </div>
      </div>
    </header>
  )
}
