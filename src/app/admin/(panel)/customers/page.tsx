import type { Metadata } from 'next'
import Link from 'next/link'
import { AdminSearch } from '@/components/admin/search'
import { AEmpty, dateOnly, PageHeader, SampleTag, TableWrap, Td, Th } from '@/components/admin/ui'
import { formatMoney } from '@/lib/money'
import { formatPhone } from '@/lib/phone'
import { requireAdminPage } from '@/server/auth/current'
import { listCustomers } from '@/server/queries/admin'

export const metadata: Metadata = { title: 'Харилцагч' }

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/customers', 'customers.view'), searchParams])
  const rows = await listCustomers(actor, { q: sp.q?.slice(0, 60) })
  return (
    <>
      <PageHeader
        title="Харилцагч"
        description={actor.role === 'demo' ? 'Жишээ харилцагчид болон таны демо захиалгын мэдээлэл. Бусад зочны мэдээлэл харагдахгүй.' : 'Захиалга хийсэн бүх харилцагч.'}
      />
      <div className="mb-4">
        <AdminSearch placeholder="Нэр эсвэл утас…" />
      </div>
      {rows.length === 0 ? (
        <AEmpty title="Харилцагч олдсонгүй" />
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Нэр</Th>
              <Th>Холбоо барих</Th>
              <Th className="text-right">Захиалга</Th>
              <Th className="text-right">Нийт дүн</Th>
              <Th>Сүүлд</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-paper">
                <Td>
                  <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {!c.visitorId && <span className="ml-2"><SampleTag /></span>}
                </Td>
                <Td className="text-stone-600">
                  {formatPhone(c.phone)}
                  {c.email && <span className="block text-[12px]">{c.email}</span>}
                </Td>
                <Td className="tabular text-right">{c.orders}</Td>
                <Td className="tabular text-right font-medium">{formatMoney(c.spent)}</Td>
                <Td className="text-stone-600">{c.lastOrderAt ? dateOnly.format(new Date(c.lastOrderAt)) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
