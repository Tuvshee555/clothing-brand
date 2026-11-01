import { desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { buttonClass } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/feedback'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { readVisitorKey } from '@/server/visitor'

export const metadata: Metadata = { title: 'Миний захиалга', robots: { index: false } }

const fmt = new Intl.DateTimeFormat('mn-MN', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'medium' })

async function OrdersBody() {
  const visitorKey = await readVisitorKey()
  const orders = visitorKey
    ? await db.select().from(t.orders).where(eq(t.orders.visitorId, visitorKey)).orderBy(desc(t.orders.placedAt)).limit(50)
    : []
  if (orders.length === 0) {
    return (
      <EmptyState title="Захиалга алга" action={<Link href="/shop" className={buttonClass('primary')}>Дэлгүүр үзэх</Link>}>
        Энэ хөтчөөр хийсэн захиалга энд харагдана. Бүртгэл шаардлагагүй.
      </EmptyState>
    )
  }
  return (
    <ul className="divide-y divide-stone-200 border-y border-stone-200">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-4 py-5 hover:bg-paper-2 sm:px-3">
            <span>
              <span className="font-medium">{o.number}</span>
              <span className="ml-3 text-[13px] text-stone-600">
                {fmt.format(o.placedAt)} · {o.itemCount} бараа
              </span>
            </span>
            <span className="flex items-center gap-3">
              <Badge tone={o.status === 'cancelled' ? 'danger' : o.status === 'delivered' ? 'success' : 'neutral'}>{ORDER_STATUS_LABELS[o.status as OrderStatus]}</Badge>
              <Badge tone={o.paymentStatus === 'unpaid' ? 'warning' : 'info'}>{PAYMENT_STATUS_LABELS[o.paymentStatus as PaymentStatus]}</Badge>
              <span className="tabular w-28 text-right">{formatMoney(o.total)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function MyOrdersPage() {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <h1 className="display mb-2 text-[40px] sm:text-[52px]">Миний захиалга</h1>
      <p className="mb-8 text-[14px] text-stone-600">Энэ хөтчөөр хийсэн захиалгууд (демо).</p>
      <Suspense fallback={<div className="h-48 animate-pulse bg-paper-2" />}>
        <OrdersBody />
      </Suspense>
    </div>
  )
}
