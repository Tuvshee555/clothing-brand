import type { Metadata } from 'next'
import Link from 'next/link'
import { AEmpty, dateTime, PageHeader, SampleTag, TableWrap, Td, Th } from '@/components/admin/ui'
import { cn } from '@/lib/cn'
import { requireAdminPage } from '@/server/auth/current'
import { listInquiries, type InquiryKind } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Харилцагчийн асуулт' }

const KINDS: [InquiryKind | 'all', string, string][] = [
  ['all', 'Бүгд', ''],
  ['unanswered', 'Хариулж чадаагүй', 'Сангаас баттай хариулт олдоогүй асуулт — «Мэдлэг» хэсэгт хариулт нэмэх эсвэл бараан дээр мэдээлэл нөхөх'],
  ['not_in_catalogue', 'Каталогт байхгүй', 'Худалдан авагчийн хайсан ч манайд байхгүй бараа — нэр төрлийн санаа'],
  ['variant_unavailable', 'Дууссан хувилбар', 'Дууссан өнгө, хэмжээний эрэлт — нөхөн дүүргэх дохио'],
]

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/assistant/inquiries', 'assistant.view'), searchParams])
  const kind = (KINDS.find(([k]) => k === sp.kind)?.[0] ?? 'all') as InquiryKind | 'all'
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const rows = await listInquiries(actor, { days, kind })
  const label = Object.fromEntries(KINDS.map(([k, l]) => [k, l]))
  return (
    <>
      <PageHeader title="Харилцагчийн асуулт" description="Туслах хариулж чадаагүй, каталогт олдоогүй, дууссан хувилбар хүссэн асуултууд — юу нэмэх, юуг нөөцлөхийг харуулна." />
      <div className="mb-2 flex flex-wrap gap-1.5">
        {KINDS.map(([key, name]) => (
          <Link key={key} href={`/admin/assistant/inquiries?kind=${key}&days=${days}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', kind === key ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
            {name}
          </Link>
        ))}
        <span className="mx-2 border-l border-stone-200" />
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/admin/assistant/inquiries?kind=${kind}&days=${d}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', days === d ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
            {d} хоног
          </Link>
        ))}
      </div>
      {kind !== 'all' && <p className="mb-4 text-[12.5px] text-stone-600">{KINDS.find(([k]) => k === kind)?.[2]}</p>}
      {rows.length === 0 ? (
        <AEmpty title="Энэ хугацаанд асуулт алга">Туслах бүх асуултад сангаас хариулсан байна.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Асуулт</Th>
              <Th>Төрөл</Th>
              <Th>Бараа</Th>
              <Th>Огноо</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-paper">
                <Td className="max-w-[420px]">
                  <Link href={`/admin/assistant/conversations/${r.conversationId}`} className="hover:underline">
                    «{r.question || '—'}»
                  </Link>
                  {r.sample && (
                    <span className="ml-2">
                      <SampleTag />
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{label[r.kind]}</Td>
                <Td className="text-stone-600">{r.products.join(', ') || '—'}</Td>
                <Td className="whitespace-nowrap text-stone-600">{dateTime.format(r.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
