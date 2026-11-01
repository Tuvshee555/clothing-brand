import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OrderActions } from '@/components/admin/order-actions'
import { Card, dateTime, OrderStatusBadge, PageHeader, PaymentBadge, SampleTag } from '@/components/admin/ui'
import { OrderProgress } from '@/components/order-progress'
import { sizeLabel } from '@/lib/catalog'
import { INVENTORY_REASON_LABELS, type InventoryReason } from '@/lib/inventory'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_HINTS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getOrderDetail } from '@/server/queries/admin'
import { demoCanTouch } from '@/server/services/orders'

export const metadata: Metadata = { title: 'Захиалгын дэлгэрэнгүй' }

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [actor, { id }] = await Promise.all([requireAdminPage('/admin/orders', 'orders.view'), params])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await getOrderDetail(actor, id)
  if (!data) notFound()
  const { order, items, events, payments, stockMoves } = data
  const status = order.status as OrderStatus
  const paymentStatus = order.paymentStatus as PaymentStatus
  const canUpdate = hasPermission(actor.role, 'orders.update') && demoCanTouch(actor, order)
  const lockedReason =
    actor.role === 'demo'
      ? 'Энэ бол жишээ захиалга — демо горимд зөвхөн харна. Дэлгүүрээс өөрөө захиалга хийвэл түүний төлөвийг энд өөрчилж, үлдэгдэл хэрхэн өөрчлөгдөхийг харна.'
      : null
  const canRecordCash = actor.role !== 'demo' && order.paymentMethod === 'cash_on_delivery' && paymentStatus === 'unpaid' && status !== 'cancelled'

  return (
    <>
      <PageHeader
        back={{ href: '/admin/orders', label: 'Захиалга' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {order.number} <OrderStatusBadge status={status} /> <PaymentBadge status={paymentStatus} /> {order.source === 'seed' && <SampleTag />}
          </span>
        }
        description={`${dateTime.format(order.placedAt)} · ${order.source === 'seed' ? 'Жишээ захиалга' : 'Вэб дэлгүүр'}`}
      />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Явц">
            <OrderProgress status={status} />
            <div className="mt-5">
              <OrderActions orderId={order.id} status={status} canUpdate={canUpdate} lockedReason={lockedReason} canRecordCash={canRecordCash} />
            </div>
          </Card>
          <Card title={`Бараа (${order.itemCount})`} padded={false}>
            <ul className="divide-y divide-stone-100">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-md bg-bone">
                    {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" className="object-cover" />}
                  </span>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-stone-600">
                      {item.colorName} · {sizeLabel(item.size)} · <span className="font-mono text-[11.5px]">{item.sku}</span>
                    </p>
                    {item.currentStock !== null && <p className="text-[11.5px] text-stone-500">Одоогийн үлдэгдэл: {item.currentStock}</p>}
                  </div>
                  <div className="tabular text-right text-[13px]">
                    <p>
                      {item.quantity} × {formatMoney(item.unitPrice)}
                    </p>
                    <p className="font-medium">{formatMoney(item.lineTotal)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-stone-200 px-5 py-4 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-stone-600">Барааны дүн</dt>
                <dd className="tabular">{formatMoney(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-stone-600">Хүргэлт ({order.shippingMethodName})</dt>
                <dd className="tabular">{order.shippingFee === 0 ? 'Үнэгүй' : formatMoney(order.shippingFee)}</dd>
              </div>
              <div className="flex justify-between text-[14px] font-medium">
                <dt>Нийт</dt>
                <dd className="tabular">{formatMoney(order.total)}</dd>
              </div>
            </dl>
            <p className="border-t border-stone-200 px-5 py-3 text-[11.5px] text-stone-500">
              Үнэ нь захиалга үүссэн үеийн хадгалагдсан үнэ — дараа нь барааны үнэ өөрчлөгдсөн ч энэ захиалгад нөлөөлөхгүй.
            </p>
          </Card>
          <Card title="Үлдэгдлийн хөдөлгөөн" padded={false}>
            {stockMoves.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-stone-600">Хөдөлгөөн алга.</p>
            ) : (
              <ul className="divide-y divide-stone-100 text-[13px]">
                {stockMoves.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-28 text-[12px] text-stone-500">{dateTime.format(m.createdAt)}</span>
                    <span className="flex-1 font-mono text-[11.5px]">{m.sku}</span>
                    <span>{INVENTORY_REASON_LABELS[m.reason as InventoryReason]}</span>
                    <span className={`tabular w-10 text-right font-medium ${m.delta > 0 ? 'text-success' : 'text-danger'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                    <span className="tabular w-16 text-right text-stone-500">→ {m.stockAfter}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Харилцагч">
            <p className="text-[14px] font-medium">{order.customerName}</p>
            <p className="mt-1 text-[13px] text-stone-600">{formatPhone(order.customerPhone)}</p>
            {order.customerEmail && <p className="text-[13px] text-stone-600">{order.customerEmail}</p>}
            <Link href={`/admin/customers/${order.customerId}`} className="mt-3 inline-block text-[12.5px] underline underline-offset-2">
              Харилцагчийн түүх
            </Link>
          </Card>
          <Card title="Хүргэлт">
            <p className="text-[13px] leading-relaxed">
              {order.district}
              <br />
              {order.address}
            </p>
            {order.deliveryNote && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[12.5px] text-stone-600">«{order.deliveryNote}»</p>}
            <p className="mt-2 text-[12.5px] text-stone-600">{order.shippingMethodName}</p>
          </Card>
          <Card title="Төлбөр">
            <p className="text-[13px]">
              {PAYMENT_METHOD_LABELS[order.paymentMethod]} · <PaymentBadge status={paymentStatus} />
            </p>
            <p className="mt-2 text-[12px] text-stone-600">{PAYMENT_STATUS_HINTS[paymentStatus]}</p>
            {payments.map((p) => (
              <p key={p.id} className="mt-2 text-[12px] text-stone-500">
                QPay нэхэмжлэх · {p.mode === 'mock' ? 'симуляц' : p.mode} · {p.status === 'paid' ? 'төлөгдсөн' : p.status === 'cancelled' ? 'цуцлагдсан' : 'хүлээгдэж буй'} · {formatMoney(p.amount)}
              </p>
            ))}
          </Card>
          <Card title="Түүх">
            <ol className="space-y-3 text-[12.5px]">
              {events.map((e) => (
                <li key={e.id} className="border-l-2 border-stone-200 pl-3">
                  <p>
                    <span className="font-medium">{ORDER_STATUS_LABELS[e.toStatus as OrderStatus]}</span> <span className="text-stone-500">· {e.actorLabel}</span>
                  </p>
                  <p className="text-stone-500">{dateTime.format(e.createdAt)}</p>
                  {e.note && <p className="mt-0.5 text-stone-600">{e.note}</p>}
                </li>
              ))}
            </ol>
            {order.cancelReason && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">Цуцалсан шалтгаан: {order.cancelReason}</p>}
          </Card>
        </div>
      </div>
    </>
  )
}
