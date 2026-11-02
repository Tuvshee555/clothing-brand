import type { Metadata } from 'next'
import Link from 'next/link'
import { ConversationStateBadge, ReasonBadge } from '@/components/admin/assistant/ui'
import { AdminSearch } from '@/components/admin/search'
import { AEmpty, dateTime, PageHeader, SampleTag, TableWrap, Td, Th } from '@/components/admin/ui'
import { cn } from '@/lib/cn'
import { formatPhone } from '@/lib/phone'
import { requireAdminPage } from '@/server/auth/current'
import { listConversations, type ConversationFilter } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Яриа' }

type SP = Record<string, string | undefined>
const FILTERS: [ConversationFilter, string][] = [
  ['all', 'Бүгд'],
  ['attention', 'Анхаарах'],
  ['taken', 'Ажилтан хариулж буй'],
  ['orders', 'Захиалгатай'],
  ['samples', 'Жишээ'],
]

function href(sp: SP, patch: SP) {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
  const s = next.toString()
  return `/admin/assistant/conversations${s ? `?${s}` : ''}`
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/assistant/conversations', 'assistant.view'), searchParams])
  const filter = (FILTERS.find(([k]) => k === sp.filter)?.[0] ?? 'all') as ConversationFilter
  const data = await listConversations(actor, { filter, q: sp.q?.slice(0, 60), page: Number(sp.page) || 1 })
  return (
    <>
      <PageHeader
        title="Яриа"
        description={actor.role === 'demo' ? 'Жишээ яриа болон таны энэ хөтчөөс эхлүүлсэн яриа.' : 'Дэлгүүрийн туслахтай хийсэн бүх яриа. Туршилтын чат энд орохгүй.'}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <Link key={key} href={href(sp, { filter: key === 'all' ? undefined : key, page: undefined })} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', filter === key ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
              {label}
            </Link>
          ))}
        </div>
        <AdminSearch placeholder="Нэр, утас, мессеж…" />
      </div>
      {data.rows.length === 0 ? (
        <AEmpty title="Яриа олдсонгүй">{actor.role === 'demo' ? 'Дэлгүүрийн туслахад асуулт бичвэл таны яриа энд харагдана.' : 'Шүүлтүүрээ өөрчилж үзнэ үү.'}</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Сүүлийн мессеж</Th>
              <Th>Харилцагч</Th>
              <Th>Төлөв</Th>
              <Th className="text-right">Мессеж</Th>
              <Th>Огноо</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.rows.map((c) => (
              <tr key={c.id} className="hover:bg-paper">
                <Td className="max-w-[360px]">
                  <Link href={`/admin/assistant/conversations/${c.id}`} className="line-clamp-2 hover:underline">
                    {c.lastRole === 'customer' ? '' : c.lastRole === 'staff' ? 'Ажилтан: ' : 'Туслах: '}
                    {c.lastText ?? '—'}
                  </Link>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {c.channel === 'sample' && <SampleTag />}
                    {c.mine && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">Таны</span>}
                    {c.orders > 0 && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] text-info">Захиалга {c.orders}</span>}
                    {c.unreadForStaff > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning">{c.unreadForStaff} шинэ</span>}
                  </span>
                </Td>
                <Td>
                  {c.customerName ?? <span className="text-stone-500">Нэргүй</span>}
                  {c.customerPhone && <span className="block text-[12px] text-stone-500">{formatPhone(c.customerPhone)}</span>}
                </Td>
                <Td>
                  <span className="flex flex-col items-start gap-1">
                    <ConversationStateBadge paused={c.paused} needsHuman={c.needsHuman} />
                    <ReasonBadge reason={c.needsHuman ? c.handoffReason : null} />
                  </span>
                </Td>
                <Td className="tabular text-right">{c.messageCount}</Td>
                <Td className="whitespace-nowrap text-stone-600">{dateTime.format(c.lastMessageAt)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      {data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <span className="text-stone-600">
            {data.total} яриа · {data.page}/{data.pages}
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
