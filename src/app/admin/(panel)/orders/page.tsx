import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminSearch } from '@/components/admin/search'
import { AEmpty, dateTime, OrderStatusBadge, PageHeader, PaymentBadge, SampleTag, TableWrap, Td, Th } from '@/components/admin/ui'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUS_LABELS, ORDER_STATUSES, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { requireAdminPage } from '@/server/auth/current'
import { listOrders } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Захиалга' }

type SP = Record<string, string | undefined>

function href(sp: SP, patch: SP) {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
  const s = next.toString()
  return `/admin/orders${s ? `?${s}` : ''}`
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/orders', 'orders.view'), searchParams])
  const status = sp.status ?? 'all'
  const data = await listOrders(actor, { q: sp.q?.slice(0, 60), status, payment: sp.payment, page: Number(sp.page) || 1 })
  const counts = Object.fromEntries(data.statusCounts.map((c) => [c.status, c.n]))
  const all = data.statusCounts.reduce((s, c) => s + c.n, 0)
  return (
    <>
      <PageHeader title="Захиалга" description={actor.role === 'demo' ? 'Жишээ захиалгууд болон таны энэ хөтчөөр хийсэн захиалгууд.' : 'Дэлгүүрийн бүх захиалга.'} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[['all', 'Бүгд', all] as const, ...ORDER_STATUSES.map((s) => [s, ORDER_STATUS_LABELS[s], counts[s] ?? 0] as const)].map(([key, label, n]) => (
          <Link
            key={key}
            href={href(sp, { status: key === 'all' ? undefined : key, page: undefined })}
            className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', status === key ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}
          >
            {label} <span className="tabular opacity-70">{n}</span>
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Дугаар, нэр, утас…" />
        <div className="flex gap-1.5 text-[12.5px]">
          {(['unpaid', 'simulated', 'paid'] as PaymentStatus[]).map((p) => (
            <Link key={p} href={href(sp, { payment: sp.payment === p ? undefined : p, page: undefined })} className={cn('rounded-lg border px-2.5 py-1.5', sp.payment === p ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white hover:border-stone-400')}>
              {PAYMENT_STATUS_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>
      {data.rows.length === 0 ? (
        <AEmpty title="Захиалга олдсонгүй">Шүүлтүүрээ өөрчилж үзнэ үү.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Дугаар</Th>
              <Th>Огноо</Th>
              <Th>Харилцагч</Th>
              <Th>Бараа</Th>
              <Th>Төлөв</Th>
              <Th>Төлбөр</Th>
              <Th className="text-right">Дүн</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((o) => (
              <tr key={o.id} className="hover:bg-paper">
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                    {o.number}
                  </Link>
                  {o.source === 'seed' && <span className="ml-2"><SampleTag /></span>}
                  {actor.role === 'demo' && o.source === 'storefront' && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">Таны</span>}
                </Td>
                <Td className="text-stone-600">{dateTime.format(o.placedAt)}</Td>
                <Td>
                  {o.customerName}
                  <span className="block text-[12px] text-stone-500">
                    {formatPhone(o.customerPhone)} · {o.district}
                  </span>
                </Td>
                <Td className="tabular">{o.itemCount}</Td>
                <Td>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                </Td>
                <Td>
                  <PaymentBadge status={o.paymentStatus as PaymentStatus} />
                  <span className="block text-[11.5px] text-stone-500">{PAYMENT_METHOD_LABELS[o.paymentMethod]}</span>
                </Td>
                <Td className="tabular text-right font-medium">{formatMoney(o.total)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-stone-600">
            {data.total} захиалга · {data.page}/{data.pages} хуудас
          </span>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link href={href(sp, { page: String(data.page - 1) })} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5">
                Өмнөх
              </Link>
            )}
            {data.page < data.pages && (
              <Link href={href(sp, { page: String(data.page + 1) })} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5">
                Дараах
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  )
}
