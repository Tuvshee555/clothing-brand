import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CatalogSkeleton, CatalogView } from '@/components/store/catalog-view'
import type { RawParams } from '@/lib/catalog-params'
import { getNavigation } from '@/server/queries/catalog'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const nav = await getNavigation()
  const c = nav.collections.find((x) => x.slug === slug)
  if (!c) return { title: 'Олдсонгүй' }
  return {
    title: c.name,
    description: c.description ?? undefined,
    alternates: { canonical: `/collections/${c.slug}` },
    openGraph: c.imageUrl ? { images: [{ url: c.imageUrl }] } : undefined,
  }
}

async function Results({ params, searchParams }: Props) {
  const [{ slug }, sp, nav] = await Promise.all([params, searchParams, getNavigation()])
  const c = nav.collections.find((x) => x.slug === slug)
  if (!c) notFound()
  return (
    <>
      {c.imageUrl && (
        <div className="relative h-[34vh] min-h-[240px] max-h-[420px] bg-bone">
          <Image src={c.imageUrl} alt={c.name} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/35 to-transparent" />
        </div>
      )}
      <CatalogView preset={{ collection: c.slug, title: c.name, eyebrow: c.eyebrow ?? 'Цуглуулга', description: c.description }} params={sp} />
    </>
  )
}

export default function CollectionPage(props: Props) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <Results {...props} />
    </Suspense>
  )
}
