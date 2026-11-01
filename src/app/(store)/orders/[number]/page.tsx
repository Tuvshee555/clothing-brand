import { and, asc, desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { OrderProgress } from '@/components/order-progress'
import { DemoAdminButton } from '@/components/store/demo-admin-link'
import { PaymentPanel } from '@/components/store/payment-panel'
import { Badge } from '@/components/ui/feedback'
import { sizeLabel } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { findCustomerOrder } from '@/server/services/orders'
import { readVisitorKey } from '@/server/visitor'

export const metadata: Metadata = { title: 'Захиалга', robots: { index: false, follow: false } }

type Props = { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const fmt = new Intl.DateTimeFormat('mn-MN', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'medium', timeStyle: 'short' })

async function OrderBody({ params, searchParams }: Props) {
  const [{ number }, sp, visitorKey] = await Promise.all([params, searchParams, readVisitorKey()])
  const token = typeof sp.t === 'string' ? sp.t : null
  const order = await findCustomerOrder(db, number, { token, visitorKey })
  if (!order) notFound()
  const [items, events, payment] = await Promise.all([
    db.select().from(t.orderItems).where(eq(t.orderItems.orderId, order.id)),
    db.select().from(t.orderEvents).where(eq(t.orderEvents.orderId, order.id)).orderBy(asc(t.orderEvents.createdAt)),
    db
      .select()
      .from(t.payments)
      .where(and(eq(t.payments.orderId, order.id)))
      .orderBy(desc(t.payments.createdAt))
      .limit(1)
      .then((r) => r[0] ?? null),
  ])
  const status = order.status as OrderStatus
  const paymentStatus = order.paymentStatus as PaymentStatus
  const awaitingQpay = order.paymentMethod === 'qpay' && paymentStatus === 'unpaid' && status !== 'cancelled'

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
      <div className="space-y-10">
        <div>
          <p className="eyebrow text-stone-600">Захиалга {order.number}</p>
          <h1 className="display mt-2 text-[38px] sm:text-[48px]">
            {status === 'cancelled' ? 'Захиалга цуцлагдсан' : awaitingQpay ? 'Төлбөрөө хийнэ үү' : 'Захиалга хүлээн авлаа'}
          </h1>
          <p className="mt-3 text-[14px] text-stone-600">
            {fmt.format(order.placedAt)} · {ORDER_STATUS_LABELS[status]} · {PAYMENT_STATUS_LABELS[paymentStatus]}
          </p>
        </div>
        <OrderProgress status={status} />

        <section>
          <h2 className="eyebrow mb-4">Бараа</h2>
          <ul className="divide-y divide-stone-200 border-y border-stone-200">
            {items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <span className="relative aspect-[4/5] w-16 shrink-0 bg-bone">
                  {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill sizes="64px" className="object-cover" />}
                </span>
                <div className="flex-1 text-[14px]">
                  <Link href={`/products/${item.productSlug}`} className="hover:underline">
                    {item.productName}
                  </Link>
                  <p className="text-[13px] text-stone-600">
                    {item.colorName} · {sizeLabel(item.size)} · {item.quantity} × {formatMoney(item.unitPrice)}
                  </p>
                </div>
                <span className="tabular text-[14px]">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-[14px]">
            <div className="flex justify-between">
              <dt>Барааны дүн</dt>
              <dd className="tabular">{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Хүргэлт</dt>
              <dd className="tabular">{order.shippingFee === 0 ? 'Үнэгүй' : formatMoney(order.shippingFee)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 font-medium">
              <dt>Нийт</dt>
              <dd className="tabular">{formatMoney(order.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="eyebrow mb-3">Хүргэлт</h2>
            <p className="text-[14px] leading-relaxed">
              {order.customerName}
              <br />
              {formatPhone(order.customerPhone)}
              <br />
              {order.district}, {order.address}
              {order.deliveryNote && (
                <>
                  <br />
                  <span className="text-stone-600">{order.deliveryNote}</span>
                </>
              )}
            </p>
            <p className="mt-2 text-[13px] text-stone-600">{order.shippingMethodName}</p>
          </div>
          <div>
            <h2 className="eyebrow mb-3">Түүх</h2>
            <ol className="space-y-2 text-[13px]">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="text-stone-600">{fmt.format(e.createdAt)}</span> — {ORDER_STATUS_LABELS[e.toStatus as OrderStatus]}
                  {e.note && <span className="block text-stone-600">{e.note}</span>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-6 lg:sticky lg:top-24">
        <div className="border border-stone-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="eyebrow">Төлбөр</h2>
            <Badge tone={paymentStatus === 'unpaid' ? 'warning' : paymentStatus === 'simulated' ? 'info' : 'success'}>{PAYMENT_STATUS_LABELS[paymentStatus]}</Badge>
          </div>
          <p className="mb-4 text-[14px]">
            {PAYMENT_METHOD_LABELS[order.paymentMethod]} · <span className="tabular font-medium">{formatMoney(order.total)}</span>
          </p>
          {awaitingQpay ? (
            <PaymentPanel
              number={order.number}
              token={token}
              total={order.total}
              mode={(payment?.mode as 'mock' | 'sandbox' | 'production') ?? 'mock'}
              hasInvoice={payment?.status === 'pending'}
              qrImage={null}
            />
          ) : order.paymentMethod === 'cash_on_delivery' ? (
            <p className="text-[13px] text-stone-600">Барааг хүлээн авахдаа бэлнээр эсвэл картаар төлнө. Демо: бодит хүргэлт, төлбөр байхгүй.</p>
          ) : paymentStatus === 'simulated' ? (
            <p className="text-[13px] text-stone-600">Туршилтын QPay төлбөр бүртгэгдсэн. Бодит мөнгө шилжээгүй.</p>
          ) : null}
        </div>
        <div className="border border-stone-200 bg-paper-2 p-6">
          <p className="text-[14px] font-medium">Дэлгүүрийн эзний талаас харах</p>
          <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
            Энэ захиалга удирдлагын самбарт яг одоо орж ирсэн. Демо самбараас төлөвийг нь өөрчилж, үлдэгдлийн түүхийг харж болно.
          </p>
          <div className="mt-4">
            <DemoAdminButton next={`/admin/orders/${order.id}`} />
          </div>
        </div>
        <p className="text-[12px] text-stone-500">
          Энэ хуудасны холбоосыг хадгалаарай. <Link href="/orders" className="underline underline-offset-2">Миний захиалгууд</Link> хэсгээс энэ хөтчөөр хийсэн захиалгаа харна.
        </p>
      </aside>
    </div>
  )
}

export default function OrderPage(props: Props) {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <Suspense fallback={<div className="h-96 animate-pulse bg-paper-2" />}>
        <OrderBody {...props} />
      </Suspense>
    </div>
  )
}
