import { and, eq, sql } from 'drizzle-orm'
import { ArrowUpRight, Info, LogOut, Store } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { AdminMobileNav, AdminSidebar } from '@/components/admin/nav'
import { ROLE_LABELS } from '@/lib/roles'
import { BRAND } from '@/lib/brand'
import { logoutAction } from '@/server/actions/auth'
import { requireAdminPage } from '@/server/auth/current'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { orderScope } from '@/server/queries/admin'

export const instant = false

async function Shell({ children }: { children: React.ReactNode }) {
  const actor = await requireAdminPage('/admin')
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.orders)
    .where(and(eq(t.orders.status, 'pending'), orderScope(actor)))
  const badges = { '/admin/orders': pending?.n ?? 0 }
  const userBlock = (
    <div className="space-y-2 px-2 text-[12.5px]">
      <p>
        <span className="font-medium">{actor.name}</span>
        <span className="block text-stone-600">{ROLE_LABELS[actor.role]}</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">
          <Store className="h-3.5 w-3.5" /> Дэлгүүр
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="inline-flex items-center gap-1 text-stone-600 hover:text-ink">
            <LogOut className="h-3.5 w-3.5" /> Гарах
          </button>
        </form>
      </div>
    </div>
  )
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-stone-200 bg-white lg:flex lg:flex-col lg:py-5">
        <Link href="/admin" className="mb-6 px-5">
          <span className="wordmark text-[15px]">{BRAND.name}</span>
          <span className="mt-1 block text-[11.5px] text-stone-600">Удирдлагын самбар</span>
        </Link>
        <AdminSidebar badges={badges} />
        <div className="mt-auto border-t border-stone-200 px-3 pt-4">{userBlock}</div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <AdminMobileNav badges={badges} footer={userBlock} />
          <span className="wordmark text-sm">{BRAND.name}</span>
          <span className="ml-auto text-[12px] text-stone-600">{ROLE_LABELS[actor.role]}</span>
        </header>
        {actor.role === 'demo' && (
          <div className="border-b border-info/20 bg-info-soft px-4 py-2.5 text-[12.5px] text-info sm:px-8">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                <strong>Демо горим:</strong> жишээ өгөгдлийг харна, дэлгүүрээс өөрөө хийсэн захиалгынхаа төлөвийг өөрчилнө. Бүтээгдэхүүн, үлдэгдэл, тохиргоог
                засах нь эзэмшигчийн эрх.
              </span>
              <a href={BRAND.portfolioUrl} className="inline-flex items-center gap-0.5 underline underline-offset-2">
                {BRAND.agencyName} <ArrowUpRight className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}
        <main className="px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-stone-200 bg-white lg:block" />
      <div className="animate-pulse space-y-4 px-8 py-8">
        <div className="h-8 w-56 rounded-lg bg-white" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-white" />
      </div>
    </div>
  )
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  )
}
