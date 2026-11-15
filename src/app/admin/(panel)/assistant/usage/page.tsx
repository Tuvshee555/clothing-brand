import type { Metadata } from 'next'
import Link from 'next/link'
import { ModeBadge, Notice } from '@/components/admin/assistant/ui'
import { AEmpty, Card, PageHeader, Stat, TableWrap, Td, Th } from '@/components/admin/ui'
import { PRICE_PER_MILLION_USD } from '@/lib/chat/models'
import { cn } from '@/lib/cn'
import { requireAdminPage } from '@/server/auth/current'
import { getUsage } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'AI хэрэглээ, зардал' }

const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, sp] = await Promise.all([requireAdminPage('/admin/assistant/usage', 'assistant.view'), searchParams])
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const { status, rows, replies } = await getUsage(days)
  const total = rows.reduce((a, r) => ({ calls: a.calls + r.calls, cost: a.cost + r.costMicroUsd, input: a.input + r.inputTokens, output: a.output + r.outputTokens }), { calls: 0, cost: 0, input: 0, output: 0 })
  const budgetShare = status.budgetUsd > 0 ? Math.min(100, Math.round((status.spentTodayUsd / status.budgetUsd) * 100)) : 0
  return (
    <>
      <PageHeader
        title="AI хэрэглээ, зардал"
        description="Загварын дуудлага бүрийн токен, ойролцоо зардал (тооцоо — нэхэмжлэх биш). Дүрмээр өгсөн хариулт зардалгүй."
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
        <Notice tone="warning">
          OpenAI түлхүүр тохируулаагүй: туслах каталогийн (дүрмийн) горимд ажиллаж, AI зардал гарахгүй. AI горимыг асаахын тулд энэ дэлгүүрт зориулсан, сарын хязгаартай түлхүүрийг серверийн OPENAI_API_KEY-д нэмнэ.
        </Notice>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Өнөөдрийн зардал" value={`$${status.spentTodayUsd.toFixed(4)}`} hint={`Төсөв $${status.budgetUsd.toFixed(2)} · ${budgetShare}%`} tone={budgetShare >= 100 ? 'danger' : budgetShare >= 80 ? 'warning' : undefined} />
        <Stat label={`AI дуудлага (${days} хоног)`} value={total.calls} hint={usd(total.cost)} />
        <Stat label="Токен" value={(total.input + total.output).toLocaleString('en-US')} hint={`оролт ${total.input.toLocaleString('en-US')} · гаралт ${total.output.toLocaleString('en-US')}`} />
        <Stat label="AI-гаар өгсөн хариулт" value={`${replies?.ai ?? 0} / ${replies?.total ?? 0}`} hint="Үлдсэн нь дүрмээр (зардалгүй)" />
      </div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <ModeBadge mode={status.mode} />
          <span>
            Загвар: <strong>{status.model}</strong> (үндсэн: {status.defaultModel}). {status.reason}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-stone-500">
          Үнийн тооцоо (1 сая токен, оролт / гаралт):{' '}
          {Object.entries(PRICE_PER_MILLION_USD)
            .map(([m, [i, o]]) => `${m} $${i} / $${o}`)
            .join(' · ')}
        </p>
      </Card>
      {rows.length === 0 ? (
        <AEmpty title="Энэ хугацаанд AI дуудлага алга">Туслах бүх асуултад дүрмээр, сангаас шууд хариулсан.</AEmpty>
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Өдөр</Th>
              <Th>Загвар</Th>
              <Th>Эх үүсвэр</Th>
              <Th className="text-right">Дуудлага</Th>
              <Th className="text-right">Шалгалтад тэнцсэн</Th>
              <Th className="text-right">Токен</Th>
              <Th className="text-right">Зардал</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={`${r.day}-${r.model}-${r.source}`}>
                <Td>{r.day}</Td>
                <Td>{r.model}</Td>
                <Td>{r.source === 'test' ? 'Туршилтын чат' : 'Дэлгүүр'}</Td>
                <Td className="tabular text-right">{r.calls}</Td>
                <Td className="tabular text-right">{r.ok}</Td>
                <Td className="tabular text-right">{(r.inputTokens + r.outputTokens).toLocaleString('en-US')}</Td>
                <Td className="tabular text-right">{usd(r.costMicroUsd)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
