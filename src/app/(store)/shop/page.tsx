import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CatalogSkeleton, CatalogView } from '@/components/store/catalog-view'
import type { RawParams } from '@/lib/catalog-params'

export const metadata: Metadata = {
  title: 'Бүх бараа',
  description: 'Hoodie, свитшот, сүлжмэл, пальто, жинс, өмд, дагалдах хэрэгсэл — хэмжээ, өнгө, үнэ, үлдэгдлээр шүүнэ.',
  alternates: { canonical: '/shop' },
}

async function Results({ searchParams }: { searchParams: Promise<RawParams> }) {
  return <CatalogView preset={{ title: 'Бүх бараа', eyebrow: 'Дэлгүүр' }} params={await searchParams} />
}

export default function ShopPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <Results searchParams={searchParams} />
    </Suspense>
  )
}
