import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CatalogSkeleton, CatalogView } from '@/components/store/catalog-view'
import type { RawParams } from '@/lib/catalog-params'
import { getNavigation } from '@/server/queries/catalog'

type Props = { params: Promise<{ category: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params
  const nav = await getNavigation()
  const c = nav.categories.find((x) => x.slug === category)
  if (!c) return { title: 'Олдсонгүй' }
  return { title: c.name, description: c.description ?? undefined, alternates: { canonical: `/shop/${c.slug}` } }
}

async function Results({ params, searchParams }: Props) {
  const [{ category }, sp, nav] = await Promise.all([params, searchParams, getNavigation()])
  const c = nav.categories.find((x) => x.slug === category)
  if (!c) notFound()
  return <CatalogView preset={{ category: c.slug, activeCategory: c.slug, title: c.name, eyebrow: 'Ангилал', description: c.description }} params={sp} />
}

export default function CategoryPage(props: Props) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <Results {...props} />
    </Suspense>
  )
}
