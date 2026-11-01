import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, dateTime, OrderStatusBadge, PageHeader, PaymentBadge, SampleTag, Stat } from '@/components/admin/ui'
import { formatMoney } from '@/lib/money'
import type { OrderStatus, PaymentStatus } from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { requireAdminPage } from '@/server/auth/current'
import { getCustomer } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Харилцагч' }

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const [actor, { id }] = await Promise.all([requireAdminPage('/admin/customers', 'customers.view'), params])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await getCustomer(actor, id)
  if (!data) notFound()
  const { customer, orders } = data
  const valid = orders.filter((o) => o.status !== 'cancelled')
  const spent = valid.reduce((s, o) => s + o.total, 0)
  return (
    <>
      <PageHeader
        back={{ href: '/admin/customers', label: 'Харилцагч' }}
        title={
          <span className="flex items-center gap-3">
            {customer.name} {!customer.visitorId && <SampleTag />}
          </span>
        }
        description={`Анх бүртгэгдсэн: ${dateTime.format(customer.createdAt)}`}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          <Card title="Холбоо барих">
            <p className="text-[13.5px]">{formatPhone(customer.phone)}</p>
            <p className="text-[13.5px] text-stone-600">{customer.email ?? 'И-мэйлгүй'}</p>
            {orders[0] && (
              <p className="mt-3 text-[12.5px] text-stone-600">
                Сүүлийн хаяг: {orders[0].district}, {orders[0].address}
              </p>
            )}
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Захиалга" value={orders.length} hint={`${orders.length - valid.length} цуцлагдсан`} />
            <Stat label="Нийт дүн" value={formatMoney(spent)} />
          </div>
        </div>
        <Card title="Захиалгын түүх" padded={false}>
          <ul className="divide-y divide-stone-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px] hover:bg-paper">
                  <span className="w-20 font-medium">{o.number}</span>
                  <span className="flex-1 text-stone-600">{dateTime.format(o.placedAt)} · {o.itemCount} бараа</span>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                  <PaymentBadge status={o.paymentStatus as PaymentStatus} />
                  <span className="tabular w-24 text-right">{formatMoney(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
