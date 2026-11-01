import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { AdminSearch } from '@/components/admin/search'
import { abtn, AEmpty, PageHeader, TableWrap, Td, Th } from '@/components/admin/ui'
import { PRODUCT_STATUS_LABELS, type ProductStatus } from '@/lib/catalog'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getCatalogOptions, listProducts } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Бүтээгдэхүүн' }

type SP = Record<string, string | undefined>

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/products', 'products.view'), searchParams])
  const [products, options] = await Promise.all([listProducts({ q: sp.q?.slice(0, 60), category: sp.category, status: sp.status }), getCatalogOptions()])
  const canEdit = hasPermission(actor.role, 'products.edit')
  const link = (patch: SP) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    return `/admin/products${next.toString() ? `?${next}` : ''}`
  }
  return (
    <>
      <PageHeader
        title="Бүтээгдэхүүн"
        description={`${products.length} бараа · хувилбар, үлдэгдэл, үнийг барааны хуудаснаас удирдана.`}
        actions={
          canEdit ? (
            <Link href="/admin/products/new" className={abtn('primary')}>
              <Plus className="h-4 w-4" /> Шинэ бараа
            </Link>
          ) : (
            <span className={abtn('secondary', 'md', 'pointer-events-none opacity-50')} aria-disabled title="Демо горимд бараа нэмэх боломжгүй">
              <Plus className="h-4 w-4" /> Шинэ бараа
            </span>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Барааны нэр…" />
        <div className="flex flex-wrap gap-1.5 text-[12.5px]">
          <Link href={link({ category: undefined })} className={cn('rounded-lg px-2.5 py-1.5', !sp.category ? 'bg-ink text-white' : 'bg-white hover:bg-paper-2')}>
            Бүх ангилал
          </Link>
          {options.categories.map((c) => (
            <Link key={c.id} href={link({ category: c.slug })} className={cn('rounded-lg px-2.5 py-1.5', sp.category === c.slug ? 'bg-ink text-white' : 'bg-white hover:bg-paper-2')}>
              {c.name}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5 text-[12.5px]">
          {(['active', 'draft', 'archived'] as ProductStatus[]).map((s) => (
            <Link key={s} href={link({ status: sp.status === s ? undefined : s })} className={cn('rounded-lg border px-2.5 py-1.5', sp.status === s ? 'border-ink bg-ink text-white' : 'border-stone-300 bg-white')}>
              {PRODUCT_STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
      </div>
      {products.length === 0 ? (
        <AEmpty title="Бараа олдсонгүй" />
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Бараа</Th>
              <Th>Ангилал</Th>
              <Th>Төлөв</Th>
              <Th className="text-right">Үнэ</Th>
              <Th>Хувилбар</Th>
              <Th className="text-right">Үлдэгдэл</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-paper">
                <Td>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    <span className="relative aspect-[4/5] w-10 shrink-0 overflow-hidden rounded-md bg-bone">
                      {p.image && <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />}
                    </span>
                    <span>
                      <span className="font-medium hover:underline">{p.name}</span>
                      <span className="block text-[11.5px] text-stone-500">
                        {p.isFeatured && 'Онцлох · '}
                        {p.isNewArrival && 'Шинэ · '}/{p.slug}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td className="text-stone-600">{p.categoryName}</Td>
                <Td>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11.5px] font-medium',
                      p.status === 'active' ? 'bg-success-soft text-success' : p.status === 'draft' ? 'bg-warning-soft text-warning' : 'bg-paper-2 text-stone-600',
                    )}
                  >
                    {PRODUCT_STATUS_LABELS[p.status]}
                  </span>
                </Td>
                <Td className="tabular text-right">{formatMoney(p.basePrice)}</Td>
                <Td className="text-stone-600">
                  {p.stats.variants}
                  {p.stats.low > 0 && <span className="ml-2 rounded-full bg-warning-soft px-1.5 text-[11px] text-warning">{p.stats.low} цөөн</span>}
                  {p.stats.out > 0 && <span className="ml-1 rounded-full bg-danger-soft px-1.5 text-[11px] text-danger">{p.stats.out} дууссан</span>}
                </Td>
                <Td className="tabular text-right font-medium">{p.stats.stock}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
