import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CartLines } from '@/components/store/cart-lines'
import { buttonClass } from '@/components/ui/button'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { db } from '@/server/db'
import { getStoreContent } from '@/server/queries/settings'
import { getCartView } from '@/server/services/cart'
import { readVisitorKey } from '@/server/visitor'

export const metadata: Metadata = { title: 'Сагс', robots: { index: false } }

async function CartBody() {
  const [cart, content] = await Promise.all([getCartView(db, await readVisitorKey()), getStoreContent()])
  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Таны сагс хоосон байна" action={<Link href="/shop" className={buttonClass('primary')}>Дэлгүүр үзэх</Link>}>
        Таалагдсан бараагаа өнгө, хэмжээгээр нь сонгоод сагсандаа нэмээрэй.
      </EmptyState>
    )
  }
  const ub = content.shipping.find((s) => s.region === 'ub' && s.freeThreshold)
  const remaining = ub?.freeThreshold ? Math.max(0, ub.freeThreshold - cart.subtotal) : null
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      <CartLines lines={cart.lines} />
      <aside className="h-fit border border-stone-200 bg-white p-6 lg:sticky lg:top-24">
        <h2 className="eyebrow mb-5">Захиалгын дүн</h2>
        <div className="flex justify-between text-[14px]">
          <span>Бараа ({cart.itemCount})</span>
          <span className="tabular">{formatMoney(cart.subtotal)}</span>
        </div>
        <div className="mt-2 flex justify-between text-[14px] text-stone-600">
          <span>Хүргэлт</span>
          <span>Дараагийн алхамд</span>
        </div>
        {remaining !== null && (
          <p className="mt-4 bg-paper-2 px-3 py-2 text-[12.5px]">
            {remaining > 0 ? `Улаанбаатарт үнэгүй хүргэлт хүртэл ${formatMoney(remaining)} дутуу.` : 'Улаанбаатарт энгийн хүргэлт үнэгүй.'}
          </p>
        )}
        <div className="mt-5 flex items-baseline justify-between border-t border-stone-200 pt-4">
          <span className="text-[14px]">Дүн</span>
          <span className="tabular text-xl">{formatMoney(cart.subtotal)}</span>
        </div>
        {cart.hasProblems && (
          <Alert tone="warning" className="mt-4">
            Зарим барааны үлдэгдэл өөрчлөгдсөн байна. Тоо ширхэгээ засаад үргэлжлүүлнэ үү.
          </Alert>
        )}
        <Link
          href="/checkout"
          aria-disabled={cart.hasProblems}
          className={buttonClass('primary', 'lg', cn('mt-5 w-full', cart.hasProblems && 'pointer-events-none'))}
        >
          Захиалах
        </Link>
        <p className="mt-4 text-[11.5px] leading-relaxed text-stone-500">
          Үнэ, үлдэгдлийг захиалга үүсгэх мөчид сервер дахин шалгаж, нийт дүнг тооцоолно.
        </p>
      </aside>
    </div>
  )
}

export default function CartPage() {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <h1 className="display mb-8 text-[40px] sm:text-[52px]">Сагс</h1>
      <Suspense fallback={<div className="h-64 animate-pulse bg-paper-2" />}>
        <CartBody />
      </Suspense>
    </div>
  )
}
