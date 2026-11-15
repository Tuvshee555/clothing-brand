import type { Metadata } from 'next'
import Link from 'next/link'
import { HandoverStatusBadge, Notice, ReasonBadge } from '@/components/admin/assistant/ui'
import { AEmpty, dateTime, PageHeader, SampleTag, TableWrap, Td, Th } from '@/components/admin/ui'
import { cn } from '@/lib/cn'
import { formatPhone } from '@/lib/phone'
import { requireAdminPage } from '@/server/auth/current'
import { getAssistantSettings, listHandovers } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Ажилтанд шилжүүлэх' }

const TABS = [
  ['active', 'Хүлээгдэж буй'],
  ['resolved', 'Шийдэгдсэн'],
  ['all', 'Бүгд'],
] as const

function waited(from: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - from.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} мин`
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} цаг`
  return `${Math.round(minutes / 1440)} өдөр`
}

export default async function HandoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/assistant/handover', 'assistant.view'), searchParams])
  const status = (TABS.find(([k]) => k === sp.status)?.[0] ?? 'active') as (typeof TABS)[number][0]
  const [rows, { settings }] = await Promise.all([listHandovers(actor, { status }), getAssistantSettings()])
  return (
    <>
      <PageHeader
        title="Ажилтанд шилжүүлэх"
        description="Хүн хүссэн, гомдол гаргасан, төлбөр төлсөн гэсэн яриа. Хүлээн авбал туслах түр зогсож, та өөрөө хариулна; дуусаад «Туслах руу буцаах» дарна."
      />
      <Notice>
        Хүлээн авсан яриад та {settings.handoverAutoResumeHours ? `${settings.handoverAutoResumeHours} цаг` : 'хэзээ ч'} бичихгүй бол туслах {settings.handoverAutoResumeHours ? 'дахин хариулж эхэлнэ' : 'автоматаар буцахгүй'} (Чатботын тохиргоо).
        {actor.role === 'demo' && ' Демо: дэлгүүрийн туслахад «ажилтантай холбогдох» гэж бичээд, тэр яриаг энд хүлээн авч хариулж үзээрэй.'}
      </Notice>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(([key, label]) => (
          <Link key={key} href={key === 'active' ? '/admin/assistant/handover' : `/admin/assistant/handover?status=${key}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', status === key ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <AEmpty title={status === 'active' ? 'Хүлээгдэж буй хүсэлт алга' : 'Хүсэлт алга'}>Туслах хүнд шилжүүлэх шаардлагатай яриа гарахад энд жагсана.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Шалтгаан</Th>
              <Th>Асуулт, нөхцөл</Th>
              <Th>Харилцагч</Th>
              <Th>Төлөв</Th>
              <Th>Хүлээсэн</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((h) => (
              <tr key={h.id} className="align-top hover:bg-paper">
                <Td>
                  <ReasonBadge reason={h.reason} />
                  {h.channel === 'sample' && (
                    <span className="mt-1 block">
                      <SampleTag />
                    </span>
                  )}
                </Td>
                <Td className="max-w-[380px]">
                  <Link href={`/admin/assistant/conversations/${h.conversationId}`} className="font-medium hover:underline">
                    «{h.question}»
                  </Link>
                  <span className="mt-1 block text-[12px] text-stone-600">
                    {h.context.products?.length ? `Бараа: ${h.context.products.map((p) => p.name).join(', ')}` : 'Бараа дурдаагүй'}
                    {h.context.variant ? ` · ${[h.context.variant.color, h.context.variant.size].filter(Boolean).join(' / ')}` : ''}
                    {h.context.purchaseIntent ? ' · авах хүсэлтэй' : ''}
                  </span>
                </Td>
                <Td>
                  {h.customerName ?? <span className="text-stone-500">—</span>}
                  {h.customerPhone && <span className="block text-[12px] text-stone-500">{formatPhone(h.customerPhone)}</span>}
                </Td>
                <Td>
                  <HandoverStatusBadge status={h.status} />
                  {h.assignedName && <span className="mt-1 block text-[12px] text-stone-500">{h.assignedName}</span>}
                </Td>
                <Td className="whitespace-nowrap text-stone-600">
                  {h.status === 'resolved' ? dateTime.format(h.createdAt) : waited(h.createdAt)}
                  {h.unread > 0 && h.status !== 'resolved' && <span className="mt-1 block text-[11.5px] text-warning">{h.unread} шинэ мессеж</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
