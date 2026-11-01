import type { Metadata } from 'next'
import { SizeGuideTable } from '@/components/store/size-guide-table'
import { getStoreContent } from '@/server/queries/settings'

export const metadata: Metadata = {
  title: 'Хэмжээний хүснэгт',
  description: 'Цамц, свитер, пальто, өмд, жинсний хэмжээг сантиметрээр.',
  alternates: { canonical: '/size-guide' },
}

export default async function SizeGuidePage() {
  const { sizeGuide } = await getStoreContent()
  return (
    <div className="container-page max-w-4xl pt-10 sm:pt-14">
      <h1 className="display text-[40px] sm:text-[52px]">Хэмжээний хүснэгт</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-stone-600">{sizeGuide.note}</p>
      <section className="mt-12">
        <h2 className="eyebrow mb-4">Дээд хувцас — цамц, свитер, hoodie, пальто</h2>
        <SizeGuideTable guide={sizeGuide} kind="tops" />
      </section>
      <section className="mt-12">
        <h2 className="eyebrow mb-4">Доод хувцас — өмд, жинс</h2>
        <SizeGuideTable guide={sizeGuide} kind="bottoms" />
      </section>
      <section className="mt-12 border border-stone-200 bg-white p-6 text-[14px] leading-relaxed">
        <h2 className="mb-2 font-medium">Хэрхэн хэмжих вэ</h2>
        <p>
          <strong>Цээж:</strong> суганы доогуур цээжний хамгийн өргөн хэсгээр хэвтээ хэмжинэ. <strong>Бүсэлхий:</strong> хүйснээс бага зэрэг дээгүүр.{' '}
          <strong>Ташаа:</strong> ташааны хамгийн өргөн хэсгээр. Хэмжээ хоёрын дунд байвал туслахаас асуугаарай — бүтээгдэхүүний хэлбэрээс хамаарч
          зөвлөнө.
        </p>
      </section>
    </div>
  )
}
