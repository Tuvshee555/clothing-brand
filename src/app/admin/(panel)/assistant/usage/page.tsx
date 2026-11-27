import type { Metadata } from 'next'
import Link from 'next/link'
import { ModeBadge, Notice } from '@/components/admin/assistant/ui'
import { AEmpty, Card, PageHeader, Stat, TableWrap, Td, Th } from '@/components/admin/ui'
import { aiLevelLabel, formatAiCost } from '@/lib/chat/models'
import { cn } from '@/lib/cn'
import { requireAdminPage } from '@/server/auth/current'
import { getUsage } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'AI хэрэглээ, зардал' }

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, sp] = await Promise.all([requireAdminPage('/admin/assistant/usage', 'assistant.view'), searchParams])
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const { status, rows, replies } = await getUsage(days)
  // Owners read days and money, not model names or tokens: one row per day and source.
  const byDay = new Map<string, { day: string; source: string; calls: number; ok: number; costMicroUsd: number }>()
  for (const r of rows) {
    const key = `${r.day}|${r.source}`
    const row = byDay.get(key) ?? { day: r.day, source: r.source, calls: 0, ok: 0, costMicroUsd: 0 }
    row.calls += r.calls
    row.ok += r.ok
    row.costMicroUsd += r.costMicroUsd
    byDay.set(key, row)
  }
  const daily = [...byDay.values()]
  const total = daily.reduce((a, r) => ({ calls: a.calls + r.calls, ok: a.ok + r.ok, cost: a.cost + r.costMicroUsd }), { calls: 0, ok: 0, cost: 0 })
  const budgetShare = status.budgetUsd > 0 ? Math.min(100, Math.round((status.spentTodayUsd / status.budgetUsd) * 100)) : 0
  return (
    <>
      <PageHeader
        title="AI хэрэглээ, зардал"
        description="Туслах AI-аар хэдэн удаа хариулсан, ойролцоогоор хэдэн төгрөгийн зардал гарсан. Дэлгүүрийн сангаас шууд өгсөн хариулт зардалгүй."
        actions={
          <div className="flex gap-1.5">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/assistant/usage?days=${d}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', days === d ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
                {d} хоног
              </Link>
            ))}
          </div>
        }
      />
      {!status.configured && (
        <Notice tone="warning">AI холбогдоогүй: туслах каталогийн горимд ажиллаж, AI зардал гарахгүй. AI горимыг асаах бол Ursgal Digital-тай холбогдоно уу.</Notice>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Өнөөдрийн зардал"
          value={formatAiCost(status.spentTodayUsd)}
          hint={`Өдрийн хязгаар ${formatAiCost(status.budgetUsd)} · ${budgetShare}%`}
          tone={budgetShare >= 100 ? 'danger' : budgetShare >= 80 ? 'warning' : undefined}
        />
        <Stat label={`AI-аар хариулсан (${days} хоног)`} value={total.calls} hint={formatAiCost(total.cost / 1_000_000)} />
        <Stat label="Баримт шалгалтад тэнцсэн" value={total.calls ? `${Math.round((total.ok / total.calls) * 100)}%` : '—'} hint="Тэнцээгүй хариултын оронд сангаас хариулна" />
        <Stat label="AI-аар өгсөн хариулт" value={`${replies?.ai ?? 0} / ${replies?.total ?? 0}`} hint="Үлдсэн нь дэлгүүрийн сангаас (зардалгүй)" />
      </div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <ModeBadge mode={status.mode} />
          <span>
            AI-ийн түвшин: <strong>{aiLevelLabel(status.model)}</strong>. {status.reason}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-stone-500">Зардлыг төгрөгөөр ойролцоогоор харуулна — нэхэмжлэх биш.</p>
      </Card>
      {daily.length === 0 ? (
        <AEmpty title="Энэ хугацаанд AI хариулт алга">Туслах бүх асуултад дэлгүүрийн сангаас шууд хариулсан.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Өдөр</Th>
              <Th>Хаанаас</Th>
              <Th className="text-right">AI хариулт</Th>
              <Th className="text-right">Шалгалтад тэнцсэн</Th>
              <Th className="text-right">Зардал</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {daily.map((r) => (
              <tr key={`${r.day}-${r.source}`}>
                <Td>{r.day}</Td>
                <Td>{r.source === 'test' ? 'Туршилтын чат' : 'Дэлгүүр'}</Td>
                <Td className="tabular text-right">{r.calls}</Td>
                <Td className="tabular text-right">{r.ok}</Td>
                <Td className="tabular text-right">{formatAiCost(r.costMicroUsd / 1_000_000)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
