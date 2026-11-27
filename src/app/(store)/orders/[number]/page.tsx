import { and, asc, desc, eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import QRCode from 'qrcode'
import { Suspense } from 'react'
import { OrderProgress } from '@/components/order-progress'
import { DemoAdminButton } from '@/components/store/demo-admin-link'
import { PaymentPanel } from '@/components/store/payment-panel'
import { ShopHelp } from '@/components/store/shop-contact'
import { TrackOrderForm } from '@/components/store/track-order-form'
import { Badge } from '@/components/ui/feedback'
import { sizeLabel } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import {
  ORDER_STATUS_LABELS,
  orderNextStep,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  STOREFRONT_OPEN_HOURS,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { db } from '@/server/db'
import * as t from '@/server/db/schema'
import { findCustomerOrder, normalizeOrderNumber } from '@/server/services/orders'
import { readVisitorKey } from '@/server/visitor'

export const metadata: Metadata = { title: 'Захиалга', robots: { index: false, follow: false } }

type Props = { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

const fmt = new Intl.DateTimeFormat('mn-MN', { timeZone: 'Asia/Ulaanbaatar', dateStyle: 'medium', timeStyle: 'short' })

const DEMO_QR_TARGET = 'https://www.ursgaldigital.com/demo'

/** The order exists for someone else's browser: ask for its phone instead of saying "not found". */
function OrderLocked({ number }: { number: string }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="max-w-md">
        <p className="eyebrow text-stone-600">Захиалга {number}</p>
        <h1 className="display mt-2 text-[38px] sm:text-[48px]">Захиалгаа харах</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-stone-600">
          Энэ захиалгыг харахын тулд захиалга өгсөн утасны дугаараа оруулна уу. Дараа нь захиалгын явцаа харж, төлбөрөө хийнэ.
        </p>
        <div className="mt-8">
          <TrackOrderForm defaultNumber={number} />
        </div>
      </div>
      <ShopHelp className="h-fit" />
    </div>
  )
}

async function OrderBody({ params, searchParams }: Props) {
  // connection(): the lookup link's expiry is checked against the clock, read only at request time.
  const [{ number }, sp, visitorKey] = await Promise.all([params, searchParams, readVisitorKey(), connection()])
  const token = typeof sp.t === 'string' ? sp.t : null
  const order = await findCustomerOrder(db, number, { token, visitorKey })
  if (!order) {
    if (normalizeOrderNumber(number) !== number) notFound()
    return <OrderLocked number={number} />
  }
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
  const paymentMethod = order.paymentMethod as PaymentMethod
  const awaitingQpay = paymentMethod === 'qpay' && paymentStatus === 'unpaid' && status !== 'cancelled'
  const paymentMode = (payment?.mode as 'mock' | 'sandbox' | 'production' | undefined) ?? 'mock'
  // Chat orders carry their own hold; a website order stays open for STOREFRONT_OPEN_HOURS.
  const deadline = awaitingQpay ? (order.expiresAt ?? new Date(order.placedAt.getTime() + STOREFRONT_OPEN_HOURS * 3_600_000)) : null
  // In the demo the QR is real and scannable, but it only opens the agency's
  // demo page — it never carries a payment a banking app could act on.
  const demoQrSvg =
    awaitingQpay && paymentMode === 'mock'
      ? await QRCode.toString(DEMO_QR_TARGET, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
      : null

  // One grid whose source order is the phone order (title → payment → steps → items →
  // delivery → help); from `lg` the payment card sits in the right column, sticky.
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-flow-dense lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-x-10 lg:gap-y-10">
      <div className="lg:col-start-1">
        <p className="eyebrow text-stone-600">Захиалга {order.number}</p>
        <h1 className="display mt-2 text-[38px] sm:text-[48px]">
          {status === 'cancelled' ? 'Захиалга цуцлагдсан' : awaitingQpay ? 'Төлбөрөө хийнэ үү' : 'Захиалга хүлээн авлаа'}
        </h1>
        <p className="mt-3 text-[14px] text-stone-600">
          {fmt.format(order.placedAt)} · {ORDER_STATUS_LABELS[status]} · {PAYMENT_STATUS_LABELS[paymentStatus]}
        </p>
        <p className="mt-4 max-w-xl border-l-2 border-ink pl-3 text-[14px] leading-relaxed text-charcoal">
          <span className="font-medium">Одоо: </span>
          {orderNextStep({ status, paymentMethod, paymentStatus })}
        </p>
        {order.source === 'assistant' && <p className="mt-2 text-[13px] text-stone-600">Энэ захиалгыг дэлгүүрийн туслахаар чатаар үүсгэсэн.</p>}
      </div>

      <section aria-labelledby="payment-title" className="h-fit border border-stone-200 bg-white p-5 sm:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:self-start">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="payment-title" className="eyebrow">
            Төлбөр
          </h2>
          <Badge tone={paymentStatus === 'unpaid' ? 'warning' : paymentStatus === 'simulated' ? 'info' : 'success'}>{PAYMENT_STATUS_LABELS[paymentStatus]}</Badge>
        </div>
        <p className="mb-4 text-[14px]">
          {PAYMENT_METHOD_LABELS[paymentMethod]} · <span className="tabular font-medium">{formatMoney(order.total)}</span>
        </p>
        {deadline && (
          <p className="mb-5 bg-warning-soft px-3 py-2.5 text-[13px] leading-relaxed text-charcoal">
            Төлөх хугацаа: <strong className="tabular">{fmt.format(deadline)}</strong> хүртэл. Хугацаа өнгөрвөл захиалга цуцлагдаж, бараа чөлөөлөгдөнө.
          </p>
        )}
        {awaitingQpay ? (
          <PaymentPanel
            number={order.number}
            token={token}
            total={order.total}
            mode={paymentMode}
            hasInvoice={payment?.status === 'pending'}
            qrImage={null}
            qrSvg={demoQrSvg}
          />
        ) : paymentMethod === 'cash_on_delivery' ? (
          <p className="text-[13px] text-stone-600">Барааг хүлээн авахдаа бэлнээр эсвэл картаар төлнө. Демо: бодит хүргэлт, төлбөр байхгүй.</p>
        ) : paymentStatus === 'simulated' ? (
          <p className="text-[13px] text-stone-600">QPay төлбөр баталгаажлаа. Демо: бодит мөнгө шилжээгүй.</p>
        ) : null}
        {status !== 'cancelled' && (
          <p className="mt-5 border-t border-stone-200 pt-3 text-[12px] leading-relaxed text-stone-500">
            И-баримт: төлбөр баталгаажмагц захиалгын утасны дугаарт бүртгэгдэнэ. Демо дэлгүүрт баримт үүсгэхгүй.
          </p>
        )}
      </section>

      <div className="lg:col-start-1">
        <h2 className="eyebrow mb-4">Захиалгын явц</h2>
        <OrderProgress status={status} />
      </div>

      <section className="lg:col-start-1">
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

      <section className="grid gap-6 sm:grid-cols-2 lg:col-start-1">
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

      <div className="space-y-6 lg:col-start-2">
        <ShopHelp title="Захиалгын талаар асуух уу?" />
        <div className="border border-stone-200 bg-paper-2 p-6">
          <p className="text-[14px] font-medium">Дэлгүүрийн эзний талаас харах</p>
          <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
            Энэ захиалга удирдлагын самбарт яг одоо орж ирсэн. Демо самбараас төлөвийг нь өөрчилж, үлдэгдлийн түүхийг харж болно.
          </p>
          <div className="mt-4">
            <DemoAdminButton next={`/admin/orders/${order.id}`} />
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-stone-500">
          Энэ хуудасны холбоосыг хадгалаарай. Өөр утас, компьютерээс{' '}
          <Link href="/track" className="underline underline-offset-2">
            Захиалга хянах
          </Link>{' '}
          хэсэгт захиалгын дугаар, утасны дугаараа оруулж харна.
        </p>
      </div>
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
