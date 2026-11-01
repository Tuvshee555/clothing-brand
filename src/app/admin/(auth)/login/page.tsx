import { ArrowUpRight, Eye, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { DemoEnterButton, LoginForm } from '@/components/admin/login-forms'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = { title: 'Нэвтрэх' }

async function Forms({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : undefined
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <Eye className="h-5 w-5 text-stone-600" strokeWidth={1.6} />
        <h2 className="mt-3 text-[16px] font-medium">Демо самбар үзэх</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
          Нууц үггүйгээр нэвтэрч, жишээ захиалга, бүтээгдэхүүн, үлдэгдэл, тайланг харна. Дэлгүүрээс өөрөө хийсэн захиалгынхаа төлөвийг өөрчилж болно.
          Бусад зочны мэдээлэл харагдахгүй.
        </p>
        <div className="mt-5">
          <DemoEnterButton next={next} />
        </div>
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <ShieldCheck className="h-5 w-5 text-stone-600" strokeWidth={1.6} />
        <h2 className="mt-3 text-[16px] font-medium">Эзэмшигчээр нэвтрэх</h2>
        <p className="mt-1.5 text-[13px] text-stone-600">Бүрэн эрхтэй бүртгэл. Нууц үгийг нийтэд хуваалцдаггүй.</p>
        {sp.changed === '1' && <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">Нууц үг солигдлоо. Шинэ нууц үгээрээ нэвтэрнэ үү.</p>}
        <div className="mt-4">
          <LoginForm next={next} />
        </div>
      </section>
    </div>
  )
}

export default function AdminLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="wordmark text-xl">{BRAND.name}</p>
        <h1 className="mt-4 text-[24px] font-medium tracking-tight">Удирдлагын самбар</h1>
        <p className="mt-2 text-[13.5px] text-stone-600">Бүтээгдэхүүн, хувилбар, үлдэгдэл, захиалга, харилцагчийг нэг дороос удирдана.</p>
      </div>
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-white" />}>
        <Forms searchParams={searchParams} />
      </Suspense>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-[12.5px] text-stone-600">
        <Link href="/" className="hover:text-ink">
          ← Дэлгүүр рүү буцах
        </Link>
        <a href={BRAND.portfolioUrl} className="inline-flex items-center gap-1 hover:text-ink">
          {BRAND.agencyName} портфолио <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}
