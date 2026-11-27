import { ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EXAMPLE_SHOP_LINE, ShopHelp } from '@/components/store/shop-contact'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Холбоо барих',
  description: `${BRAND.name}-тай холбогдох: Messenger, утас. Ursgal Digital-ын жишээ дэлгүүр.`,
  alternates: { canonical: '/contact' },
}

const QUICK_LINKS = [
  { href: '/track', label: 'Захиалга хянах', text: 'Захиалгын дугаар, утасны дугаараараа явцаа харах' },
  { href: '/help/delivery', label: 'Хүргэлт', text: 'Хугацаа, үнэ, орон нутгийн хүргэлт' },
  { href: '/help/returns', label: 'Буцаалт', text: 'Буцаах, солих нөхцөл' },
  { href: '/help/payment', label: 'Төлбөр', text: 'QPay, хүргэлтээр төлөх' },
] as const

export default function ContactPage() {
  return (
    <div className="container-page grid gap-12 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="max-w-2xl">
        <h1 className="display text-[40px] sm:text-[52px]">Холбоо барих</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-charcoal">{EXAMPLE_SHOP_LINE}</p>
        <p className="mt-3 text-[14px] leading-relaxed text-stone-600">
          Бараа, үнэ, үлдэгдэл нь жишээ. Захиалга, төлбөрийн бүх алхам бодитоор ажилладаг ч бараа хүргэгдэхгүй, мөнгө шилжихгүй.
        </p>

        <h2 className="eyebrow mb-4 mt-10">Түгээмэл асуулт</h2>
        <ul className="divide-y divide-stone-200 border-y border-stone-200">
          {QUICK_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center justify-between gap-4 py-4 hover:bg-paper-2 sm:px-3">
                <span>
                  <span className="block text-[15px] font-medium">{l.label}</span>
                  <span className="block text-[13px] text-stone-600">{l.text}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="eyebrow mb-3 mt-10">И-баримт</h2>
        <p className="text-[14px] leading-relaxed text-charcoal">
          Төлбөр төлөгдмөгц И-баримт захиалгын утасны дугаарт бүртгэгдэнэ. Байгууллагын нэр дээр авах бол Messenger-ээр байгууллагын регистрээ бичнэ үү. Демо
          дэлгүүрт баримт үүсгэхгүй.
        </p>

        <div className="mt-10 border border-stone-200 bg-paper-2 p-6">
          <p className="text-[15px] font-medium">Ийм дэлгүүр өөрийн бизнестээ хийлгэх үү?</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-stone-600">
            Энэ сайтыг {BRAND.agencyName} хийсэн: бараа, үлдэгдэл, QPay, удирдлагын самбар, Messenger-ийн туслах бүгд нэг дор.
          </p>
          <a href={BRAND.portfolioUrl} className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium underline underline-offset-4">
            {BRAND.agencyName}-ын бусад ажил <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
      <ShopHelp className="h-fit" title={`${BRAND.name}-д бичих`} />
    </div>
  )
}
