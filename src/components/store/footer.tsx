import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { BRAND, DEMO_NOTICE } from '@/lib/brand'
import { getNavigation } from '@/server/queries/catalog'
import { getStoreContent } from '@/server/queries/settings'
import { NewsletterForm } from './newsletter-form'

export async function Footer() {
  const [nav, content] = await Promise.all([getNavigation(), getStoreContent()])
  const heading = 'eyebrow mb-4 text-stone-500'
  const link = 'link-underline text-[13.5px] text-white/85 hover:text-white'
  return (
    <footer className="mt-24 bg-ink text-white">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <p className="wordmark text-2xl">{BRAND.name}</p>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            Чимээгүй тансаг, удаан эдэлгээтэй өдөр тутмын хувцас. Зөөлөн ноолуур, нягт хөвөн, цэвэр зүсэлт — хотын хэмнэлд зориулав.
          </p>
          <div className="mt-8">
            <p className={heading}>Мэдээллийн товхимол</p>
            <NewsletterForm />
          </div>
        </div>
        <div>
          <p className={heading}>Дэлгүүр</p>
          <ul className="space-y-2.5">
            <li><Link href="/collections/new" className={link}>Шинэ ирэлт</Link></li>
            {nav.categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/shop/${c.slug}`} className={link}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className={heading}>Тусламж</p>
          <ul className="space-y-2.5">
            <li><Link href="/help/how-to-order" className={link}>Хэрхэн захиалах вэ</Link></li>
            <li><Link href="/help/delivery" className={link}>Хүргэлт</Link></li>
            <li><Link href="/help/returns" className={link}>Буцаалт</Link></li>
            <li><Link href="/help/exchange" className={link}>Хэмжээ солих</Link></li>
            <li><Link href="/help/payment" className={link}>Төлбөр</Link></li>
            <li><Link href="/size-guide" className={link}>Хэмжээний хүснэгт</Link></li>
            <li><Link href="/orders" className={link}>Миний захиалга</Link></li>
          </ul>
        </div>
        <div>
          <p className={heading}>Холбоо барих</p>
          <ul className="space-y-2.5 text-[13.5px] text-white/85">
            <li>{content.info.contactEmail}</li>
            <li className="text-white/60">{content.info.contactHours}</li>
            <li><Link href="/about" className={link}>Брэндийн тухай</Link></li>
            <li><Link href="/credits" className={link}>Зургийн эх сурвалж</Link></li>
            <li><Link href="/help/privacy" className={link}>Нууцлал</Link></li>
            <li><Link href="/admin/login" className={link}>Удирдлагын самбар (демо)</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-4 py-6 text-[12px] text-white/55 md:flex-row md:items-center md:justify-between">
          <p className="max-w-3xl leading-relaxed">{DEMO_NOTICE}</p>
          <a href={BRAND.portfolioUrl} className="inline-flex shrink-0 items-center gap-1.5 text-white/80 hover:text-white">
            {BRAND.agencyName} портфолио <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </footer>
  )
}
