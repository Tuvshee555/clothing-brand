import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { cn } from '@/lib/cn'
import { POLICY_SLUGS, type PolicyKey } from '@/lib/settings'
import { getStoreContent } from '@/server/queries/settings'

type Props = { params: Promise<{ slug: string }> }

const keyForSlug = (slug: string) => (Object.entries(POLICY_SLUGS).find(([, s]) => s === slug)?.[0] ?? null) as PolicyKey | null

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const key = keyForSlug(slug)
  if (!key) return { title: 'Олдсонгүй' }
  const { policies } = await getStoreContent()
  return { title: policies[key].title, alternates: { canonical: `/help/${slug}` } }
}

async function PolicyBody({ params }: Props) {
  const { slug } = await params
  const key = keyForSlug(slug)
  if (!key) notFound()
  const { policies } = await getStoreContent()
  const policy = policies[key]
  return (
    <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Тусламж" className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
        {(Object.keys(POLICY_SLUGS) as PolicyKey[]).map((k) => (
          <Link
            key={k}
            href={`/help/${POLICY_SLUGS[k]}`}
            className={cn('shrink-0 px-3 py-2 text-[13.5px]', k === key ? 'bg-ink text-white' : 'hover:bg-paper-2')}
            aria-current={k === key ? 'page' : undefined}
          >
            {policies[k].title}
          </Link>
        ))}
        <Link href="/size-guide" className="shrink-0 px-3 py-2 text-[13.5px] hover:bg-paper-2">
          Хэмжээний хүснэгт
        </Link>
      </nav>
      <article className="max-w-2xl">
        <h1 className="display text-[40px] sm:text-[52px]">{policy.title}</h1>
        <div className="prose-store mt-8 text-[15px] leading-relaxed text-charcoal">
          {policy.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </div>
        <p className="mt-10 border-t border-stone-200 pt-5 text-[12.5px] text-stone-600">
          Энэ нь портфолио демогийн жишээ нөхцөл бөгөөд удирдлагын самбараас засварлагдана.
        </p>
      </article>
    </div>
  )
}

export default function HelpPage(props: Props) {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <Suspense fallback={<div className="h-64 animate-pulse bg-paper-2" />}>
        <PolicyBody {...props} />
      </Suspense>
    </div>
  )
}
