import { ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { DemoAdminButton } from '@/components/store/demo-admin-link'
import { buttonClass } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import { EDITORIAL } from '@/lib/editorial'

export const metadata: Metadata = {
  title: 'Брэндийн тухай',
  description: `${BRAND.name} — чимээгүй тансаг өдөр тутмын хувцасны зохиомол брэнд, ${BRAND.agencyName}-ын портфолио демо.`,
  alternates: { canonical: '/about' },
}

const FEATURES = [
  ['Хэмжээ, өнгө тус бүрийн үлдэгдэл', 'Хувилбар бүр өөрийн SKU, үлдэгдэлтэй. Худалдан авагч зөвхөн байгаа хэмжээгээ авна.'],
  ['Найдвартай захиалга', 'Үнэ, хүргэлтийн төлбөр, нийт дүнг сервер тооцоолж, барааг гүйлгээний дотор нөөцөлнө — нэг барааг хоёр хүн зэрэг авахгүй.'],
  ['Удирдлагын самбар', 'Бүтээгдэхүүн, хувилбар, үлдэгдэл, захиалга, харилцагч, тохиргоог нэг дороос.'],
  ['Худалдааны туслах', 'Сангаас бараа хайж, үнэ, хэмжээ, үлдэгдлийг шалгаж хариулна. Мэдэхгүй зүйлээ зохиохгүй.'],
  ['QPay-д бэлэн', 'QPay холболт бэлэн. Демо нь бодит мөнгө авахгүй симуляц горимд ажиллана.'],
]

export default function AboutPage() {
  return (
    <>
      <section className="container-page grid items-center gap-12 pt-10 sm:pt-14 lg:grid-cols-2">
        <div>
          <p className="eyebrow text-stone-600">Брэнд</p>
          <h1 className="display mt-3 text-[44px] sm:text-[64px]">Манан шиг зөөлөн, чимээгүй</h1>
          <div className="prose-store mt-6 max-w-xl text-[15.5px] leading-relaxed text-charcoal">
            <p>
              {BRAND.name} («манан») бол хотын хэмнэлд зориулсан, өдөр бүр өмсөх тансаг хувцасны брэнд. Бид чанга лого, түр зуурын моодоос илүү
              материал, зүсэлт, тохь тухыг чухалчилдаг: Монгол ноолуур, нягт хөвөн, удаан эдэлгээтэй арьс.
            </p>
            <p>Өнгө нь хоорондоо зохицно. Үнэ нь шударга бөгөөд байнгын. Хуурамч хямдрал, «хуучин үнэ» байхгүй.</p>
          </div>
        </div>
        <div className="relative aspect-[4/5] bg-bone">
          <Image src={EDITORIAL.heroRight.src} alt={EDITORIAL.heroRight.alt} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
        </div>
      </section>

      <section className="mt-24 bg-ink text-white">
        <div className="container-page grid gap-12 py-20 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="eyebrow text-white/60">Портфолио демо</p>
            <h2 className="display mt-3 text-[36px] sm:text-[48px]">Энэ дэлгүүр бодит биш — систем нь бодит</h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/75">
              {BRAND.name} бол {BRAND.agencyName}-ын бүтээсэн зохиомол брэнд. Бүтээгдэхүүн, үнэ, үлдэгдэл, жишээ захиалга бүгд жишээ өгөгдөл бөгөөд
              бодит худалдаа, төлбөр, хүргэлт хийгдэхгүй. Харин сан, захиалга, үлдэгдэл, удирдлагын самбар, туслах нь жинхэнэ ажилладаг.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <DemoAdminButton next="/admin" label="Удирдлагын самбар үзэх" variant="primary" />
              <a href={BRAND.portfolioUrl} className={buttonClass('outline', 'md', 'border-white text-white hover:bg-white hover:text-ink')}>
                {BRAND.agencyName} портфолио <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </div>
          <ul className="grid gap-px bg-white/10 sm:grid-cols-2">
            {FEATURES.map(([title, text]) => (
              <li key={title} className="bg-ink p-6">
                <p className="font-medium">{title}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-white/70">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page pt-20 text-[14px] text-stone-600">
        Зургууд: Burst (Shopify)-ийн арилжааны зориулалтаар чөлөөтэй ашиглах лицензтэй гэрэл зургууд — бодит үйлдвэрлэсэн барааг харуулахгүй.{' '}
        <Link href="/credits" className="underline underline-offset-4">
          Эх сурвалж, лицензийн жагсаалт
        </Link>
      </section>
    </>
  )
}
