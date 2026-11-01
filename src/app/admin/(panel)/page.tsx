import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DailyBars } from '@/components/admin/bar-chart'
import { Card, dateTime, OrderStatusBadge, PageHeader, PaymentBadge, SampleTag, Stat } from '@/components/admin/ui'
import { sizeLabel } from '@/lib/catalog'
import { INVENTORY_REASON_LABELS, type InventoryReason } from '@/lib/inventory'
import { formatMoney, formatNumber } from '@/lib/money'
import { ORDER_STATUS_LABELS, type OrderStatus, type PaymentStatus } from '@/lib/orders'
import { requireAdminPage } from '@/server/auth/current'
import { getDashboard } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Хянах самбар' }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin', 'dashboard.view'), searchParams])
  const d = await getDashboard(actor)
  const activity = [
    ...d.events.map((e) => ({
      key: `e-${e.id}`,
      at: e.createdAt,
      text: (
        <>
          <Link href={`/admin/orders/${e.orderId}`} className="font-medium hover:underline">
            {e.number}
          </Link>{' '}
          → {ORDER_STATUS_LABELS[e.toStatus as OrderStatus]} <span className="text-stone-500">· {e.actorLabel}</span>
        </>
      ),
    })),
    ...d.stockMoves.map((m) => ({
      key: `s-${m.id}`,
      at: m.createdAt,
      text: (
        <>
          {m.productName} ({m.colorName}, {sizeLabel(m.size)}){' '}
          <span className={m.delta > 0 ? 'text-success' : 'text-danger'}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>{' '}
          <span className="text-stone-500">· {INVENTORY_REASON_LABELS[m.reason as InventoryReason]}</span>
        </>
      ),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 10)

  return (
    <>
      <PageHeader
        title={`Сайн байна уу, ${actor.role === 'demo' ? 'зочин' : actor.name}`}
        description="Дэлгүүрийн өнөөдрийн байдал. Тоо бүр мэдээллийн сангаас шууд тооцоологдоно."
        actions={
          <Link href="/admin/orders?status=pending" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-[13.5px] font-medium text-white hover:bg-charcoal">
            Хүлээгдэж буй захиалга <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      {sp.denied && <p className="mb-4 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning">Танд тэр хуудсыг үзэх эрх байхгүй байна.</p>}

      <p className="mb-3 flex items-center gap-2 text-[12px] text-stone-600">
        <SampleTag /> Дүн нь жишээ болон демо захиалгад тулгуурласан — бодит борлуулалт биш.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Бүртгэгдсэн захиалгын дүн" value={formatMoney(d.totals.revenue)} hint={`${formatNumber(d.totals.units)} ширхэг бараа · цуцлагдсаныг оруулаагүй`} />
        <Stat label="Нийт захиалга" value={d.totals.orders} hint={`${d.totals.delivered} хүргэгдсэн · ${d.totals.cancelled} цуцлагдсан`} />
        <Stat label="Хүлээгдэж буй" value={d.totals.pending} hint={`${d.totals.open} захиалга явцдаа`} tone={d.totals.pending > 0 ? 'warning' : undefined} />
        <Stat label="Бараа (нийтлэгдсэн)" value={`${d.products.active} / ${d.products.total}`} hint={`${d.stock.variants} хувилбар · ${formatNumber(d.stock.units)} ширхэг`} />
        <Stat label="Цөөн үлдсэн хувилбар" value={d.stock.low} tone={d.stock.low > 0 ? 'warning' : undefined} hint="Доод хязгаарт хүрсэн" />
        <Stat label="Дууссан хувилбар" value={d.stock.out} tone={d.stock.out > 0 ? 'danger' : undefined} hint="Үлдэгдэл 0" />
        <Stat label="Хүргэгдсэн" value={d.totals.delivered} hint="Дууссан захиалга" />
        <Stat label="Дундаж захиалга" value={formatMoney(d.totals.orders - d.totals.cancelled > 0 ? Math.round(d.totals.revenue / (d.totals.orders - d.totals.cancelled)) : 0)} hint="Цуцлагдсаныг оруулаагүй" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Сүүлийн 14 хоног" actions={<span className="text-[12px] text-stone-500">Захиалгын дүн, өдрөөр</span>}>
          <DailyBars days={14} data={d.daily} />
        </Card>
        <Card title="Их зарагдсан бараа">
          {d.topProducts.length === 0 ? (
            <p className="text-[13px] text-stone-600">Захиалга алга.</p>
          ) : (
            <ol className="space-y-3">
              {d.topProducts.map((p, i) => (
                <li key={p.slug} className="flex items-center gap-3 text-[13px]">
                  <span className="tabular w-4 text-stone-500">{i + 1}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="tabular text-stone-600">{p.units} ш</span>
                  <span className="tabular w-24 text-right">{formatMoney(p.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Сүүлийн захиалга" actions={<Link href="/admin/orders" className="text-[12.5px] text-stone-600 hover:text-ink">Бүгд →</Link>} padded={false}>
          <ul className="divide-y divide-stone-100">
            {d.recentOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px] hover:bg-paper">
                  <span className="w-20 font-medium">{o.number}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {o.customerName} {o.source === 'seed' && <SampleTag />}
                  </span>
                  <OrderStatusBadge status={o.status as OrderStatus} />
                  <PaymentBadge status={o.paymentStatus as PaymentStatus} />
                  <span className="tabular w-24 text-right">{formatMoney(o.total)}</span>
                  <span className="w-28 text-right text-[12px] text-stone-500">{dateTime.format(o.placedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card title="Үлдэгдэл анхааруулга" actions={<Link href="/admin/inventory?filter=low" className="text-[12.5px] text-stone-600 hover:text-ink">Үлдэгдэл →</Link>}>
            {d.lowStock.length === 0 ? (
              <p className="text-[13px] text-stone-600">Бүх хувилбар хангалттай үлдэгдэлтэй.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {d.lowStock.map((v) => (
                  <li key={v.variantId} className="flex items-center gap-2">
                    <Link href={`/admin/products/${v.productId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {v.productName} <span className="text-stone-500">· {v.colorName}, {sizeLabel(v.size)}</span>
                    </Link>
                    <span className={`tabular rounded-full px-2 text-[11.5px] font-medium ${v.stock === 0 ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
                      {v.stock === 0 ? 'Дууссан' : `${v.stock} үлдсэн`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Сүүлийн үйл ажиллагаа">
            <ul className="space-y-2.5 text-[12.5px]">
              {activity.map((a) => (
                <li key={a.key} className="flex gap-3">
                  <span className="w-24 shrink-0 text-stone-500">{dateTime.format(a.at)}</span>
                  <span className="min-w-0">{a.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
