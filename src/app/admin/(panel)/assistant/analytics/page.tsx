import type { Metadata } from 'next'
import Link from 'next/link'
import { BarList } from '@/components/admin/assistant/bars'
import { intentLabel } from '@/components/admin/assistant/ui'
import { Card, PageHeader, Stat } from '@/components/admin/ui'
import { HANDOFF_REASON_LABELS, isHandoffReason } from '@/lib/chat/handover'
import { cn } from '@/lib/cn'
import { requireAdminPage } from '@/server/auth/current'
import { getAnalytics } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Шинжилгээ' }

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—')

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [actor, sp] = await Promise.all([requireAdminPage('/admin/assistant/analytics', 'assistant.view'), searchParams])
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30
  const { summary: s, handovers, conversations, topProducts, customerMessages } = await getAnalytics(actor, days)
  const f = s.funnel
  return (
    <>
      <PageHeader
        title="Шинжилгээ"
        description={actor.role === 'demo' ? 'Жишээ болон таны яриан дээрх тоо.' : 'Туслах юуг асуулгаж, юуг хариулж, хэдийг худалдаанд хүргэж байна.'}
        actions={
          <div className="flex gap-1.5">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`/admin/assistant/analytics?days=${d}`} className={cn('rounded-lg px-3 py-1.5 text-[12.5px]', days === d ? 'bg-ink text-white' : 'bg-white text-charcoal hover:bg-paper-2')}>
                {d} хоног
              </Link>
            ))}
          </div>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Яриа" value={conversations.reduce((n, c) => n + c.n, 0)} hint={`${customerMessages} асуулт`} />
        <Stat label="Туслахын хариулт" value={s.replies} hint={`AI: ${pct(s.aiReplies, s.replies)} · дүрэм: ${pct(s.rulesReplies, s.replies)}`} />
        <Stat label="Хариулах хугацаа" value={s.avgDurationMs ? `${(s.avgDurationMs / 1000).toFixed(1)} с` : '—'} hint={s.p95DurationMs ? `95% нь ${(s.p95DurationMs / 1000).toFixed(1)} с-ээс бага` : undefined} />
        <Stat label="Латин үсгээр бичсэн" value={pct(s.scripts.latin, s.scripts.latin + s.scripts.cyrillic)} hint={`${s.scripts.latin} латин · ${s.scripts.cyrillic} кирилл`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Худалдан авалтын урсгал">
          <BarList
            rows={[
              { label: 'Барааны асуулт', value: f.productQuestions },
              { label: 'Авах хүсэл', value: f.purchaseIntent },
              { label: 'Үнийн санал', value: f.offers },
              { label: 'Сагсанд нэмсэн', value: f.addedToCart },
              { label: 'Чат захиалга эхэлсэн', value: f.chatOrdersStarted },
              { label: 'Захиалга үүссэн', value: f.chatOrdersCreated, hint: pct(f.chatOrdersCreated, f.purchaseIntent) },
            ]}
          />
        </Card>
        <Card title="Юу асуусан бэ">
          <BarList rows={Object.entries(s.intents).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([intent, n]) => ({ label: intentLabel(intent), value: n }))} />
        </Card>
        <Card title="Хамгийн их асуусан бараа">
          <BarList rows={topProducts.map((p) => ({ label: p.name, value: p.n }))} />
        </Card>
        <Card title="Хувилбар, үлдэгдэл">
          <BarList
            rows={[
              { label: 'Яг өнгө × хэмжээ шалгасан', value: s.variantChecks },
              { label: 'Хүссэн хувилбар дууссан / байхгүй', value: s.variantUnavailable },
              { label: 'Каталогт байхгүй бараа хайсан', value: s.notInCatalogue },
              { label: 'Хариулж чадаагүй', value: s.unanswered },
            ]}
          />
          <Link href="/admin/assistant/inquiries" className="mt-3 inline-block text-[12.5px] underline underline-offset-2">
            Асуултуудыг харах
          </Link>
        </Card>
        <Card title="Ажилтанд шилжүүлсэн шалтгаан">
          <BarList rows={handovers.map((h) => ({ label: isHandoffReason(h.reason) ? HANDOFF_REASON_LABELS[h.reason] : h.reason, value: h.n }))} empty="Энэ хугацаанд шилжүүлэг алга." />
        </Card>
        <Card title="AI баримт шалгалт">
          <BarList
            rows={[
              { label: 'AI хариулт (шалгалтад тэнцсэн)', value: s.aiReplies },
              { label: 'Шалгалтад тэнцээгүй → дүрмээр хариулсан', value: s.aiRejected },
              { label: 'AI дуудлага алдаа → дүрмээр хариулсан', value: s.aiErrors },
            ]}
            empty="AI горим энэ хугацаанд ажиллаагүй (каталогийн горим)."
          />
        </Card>
      </div>
    </>
  )
}
