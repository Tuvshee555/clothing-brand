import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminSearch } from '@/components/admin/search'
import { StockAdjust } from '@/components/admin/stock-adjust'
import { AEmpty, Card, dateTime, PageHeader, StockBadge, TableWrap, Td, Th } from '@/components/admin/ui'
import { sizeLabel, variantAvailability } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { INVENTORY_REASON_LABELS, type InventoryReason } from '@/lib/inventory'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { listInventory, listInventoryHistory } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Үлдэгдэл' }

type SP = Record<string, string | undefined>

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/inventory', 'inventory.view'), searchParams])
  const filter = sp.filter === 'low' || sp.filter === 'out' ? sp.filter : 'all'
  const [rows, history] = await Promise.all([listInventory({ q: sp.q?.slice(0, 60), filter }), listInventoryHistory(actor, { limit: 40 })])
  const canAdjust = hasPermission(actor.role, 'inventory.adjust')
  const totalUnits = rows.reduce((s, r) => s + (r.isActive ? r.stock : 0), 0)
  const link = (f: string) => `/admin/inventory?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(f !== 'all' ? { filter: f } : {}) })}`
  return (
    <>
      <PageHeader title="Үлдэгдэл" description={`Хэмжээ, өнгө тус бүрийн үлдэгдэл. ${rows.length} хувилбар · ${totalUnits} ширхэг.`} />
      {!canAdjust && (
        <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-info">Демо горимд үлдэгдлийг зөвхөн харна. Захиалга үүсгэх, цуцлахад үлдэгдэл автоматаар өөрчлөгдөхийг доорх түүхээс харж болно.</p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Бараа эсвэл SKU…" />
        <div className="flex gap-1.5 text-[12.5px]">
          {[
            ['all', 'Бүгд'],
            ['low', 'Цөөн үлдсэн'],
            ['out', 'Дууссан'],
          ].map(([f, l]) => (
            <Link key={f} href={link(f)} className={cn('rounded-lg px-3 py-1.5', filter === f ? 'bg-ink text-white' : 'bg-white hover:bg-paper-2')}>
              {l}
            </Link>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <AEmpty title="Тохирох хувилбар алга" />
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Бараа</Th>
              <Th>Өнгө</Th>
              <Th>Хэмжээ</Th>
              <Th>SKU</Th>
              <Th>Төлөв</Th>
              <Th className="text-right">Доод хязгаар</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.variantId} className={cn('hover:bg-paper', !r.isActive && 'opacity-60')}>
                <Td>
                  <Link href={`/admin/products/${r.productId}`} className="hover:underline">
                    {r.productName}
                  </Link>
                  {r.productStatus !== 'active' && <span className="ml-2 text-[11px] text-stone-500">(нийтлэгдээгүй)</span>}
                </Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: r.colorHex }} /> {r.colorName}
                  </span>
                </Td>
                <Td>{sizeLabel(r.size)}</Td>
                <Td className="font-mono text-[11.5px] text-stone-600">{r.sku}</Td>
                <Td>
                  <StockBadge availability={variantAvailability({ stock: r.stock, lowStockThreshold: r.threshold, isActive: r.isActive })} stock={r.stock} />
                </Td>
                <Td className="tabular text-right text-stone-600">{r.threshold}</Td>
                <Td className="relative">
                  <StockAdjust variantId={r.variantId} stock={r.stock} disabled={!canAdjust} label={`${r.productName} · ${r.colorName}, ${sizeLabel(r.size)}`} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Card title="Үлдэгдлийн түүх" className="mt-6" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-stone-500">
                <th className="px-5 py-2 font-medium">Огноо</th>
                <th className="px-5 py-2 font-medium">Хувилбар</th>
                <th className="px-5 py-2 font-medium">Шалтгаан</th>
                <th className="px-5 py-2 text-right font-medium">Өөрчлөлт</th>
                <th className="px-5 py-2 text-right font-medium">Дараа нь</th>
                <th className="px-5 py-2 font-medium">Хэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-[12.5px]">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-5 py-2 text-stone-500">{dateTime.format(h.createdAt)}</td>
                  <td className="px-5 py-2">
                    {h.productName} <span className="text-stone-500">· {h.colorName}, {sizeLabel(h.size)}</span>
                  </td>
                  <td className="px-5 py-2">
                    {INVENTORY_REASON_LABELS[h.reason as InventoryReason]}
                    {h.orderNumber &&
                      (h.orderVisible ? (
                        <Link href={`/admin/orders/${h.orderId}`} className="ml-1 text-stone-600 underline underline-offset-2">
                          {h.orderNumber}
                        </Link>
                      ) : (
                        <span className="ml-1 text-stone-500">(өөр зочны захиалга)</span>
                      ))}
                    {h.note && <span className="block text-[11.5px] text-stone-500">{h.note}</span>}
                  </td>
                  <td className={cn('tabular px-5 py-2 text-right font-medium', h.delta > 0 ? 'text-success' : 'text-danger')}>{h.delta > 0 ? `+${h.delta}` : h.delta}</td>
                  <td className="tabular px-5 py-2 text-right">{h.stockAfter}</td>
                  <td className="px-5 py-2 text-stone-600">{h.actorLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
