import type { Metadata } from 'next'
import Link from 'next/link'
import { AEmpty, dateTime, PageHeader, TableWrap, Td, Th } from '@/components/admin/ui'
import { cn } from '@/lib/cn'
import { requireAdminPage } from '@/server/auth/current'
import { listProblems } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Асуудал, алдаа' }

const CODE_LABELS: Record<string, string> = {
  AI_REPLY_REJECTED: 'AI хариулт баримт шалгалтад тэнцээгүй — дүрмээр хариулсан',
  AI_CALL_FAILED: 'AI дуудлага амжилтгүй — дүрмээр хариулсан',
  ENGINE_FAILURE: 'Туслахын алдаа — уучлалт гуйж, ажилтан санал болгосон',
  CHAT_ORDER_FAILED: 'Чат захиалга үүсээгүй — ажилтанд шилжүүлсэн',
  EXPIRY_SWEEP_FAILED: 'Хугацаа дууссан захиалгыг чөлөөлж чадсангүй',
}

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/assistant/problems', 'assistant.view'), searchParams])
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const rows = await listProblems(actor, { days })
  return (
    <>
      <PageHeader
        title="Асуудал, алдаа"
        description="Туслах буруу хариулахаас сэргийлж татгалзсан AI хариулт, амжилтгүй дуудлага, системийн алдаа. Худалдан авагчийн бичсэн текст, түлхүүр энд хадгалагдахгүй."
        actions={
          <div className="flex gap-1.5">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/assistant/problems?days=${d}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', days === d ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
                {d} хоног
              </Link>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <AEmpty title="Асуудал бүртгэгдээгүй">Энэ хугацаанд туслах хэвийн ажилласан.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Огноо</Th>
              <Th>Түвшин</Th>
              <Th>Юу болсон</Th>
              <Th>Дэлгэрэнгүй</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => {
              const d = (r.details ?? {}) as { problems?: string[]; model?: string; message?: string }
              return (
                <tr key={r.id} className="align-top">
                  <Td className="whitespace-nowrap text-stone-600">{dateTime.format(r.createdAt)}</Td>
                  <Td>
                    <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', r.level === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>{r.level === 'error' ? 'Алдаа' : 'Анхааруулга'}</span>
                  </Td>
                  <Td>
                    {CODE_LABELS[r.code] ?? r.code}
                    <span className="block text-[11.5px] text-stone-500">
                      {r.code} · {r.source}
                    </span>
                  </Td>
                  <Td className="max-w-[420px] text-[12.5px] text-stone-600">
                    {d.problems?.length ? d.problems.join('; ') : d.message ?? ''}
                    {d.model ? ` (${d.model})` : ''}
                    {r.linkable && r.conversationId && (
                      <Link href={`/admin/assistant/conversations/${r.conversationId}`} className="ml-2 underline underline-offset-2">
                        Яриа
                      </Link>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
