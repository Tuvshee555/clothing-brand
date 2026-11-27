import type { Metadata } from 'next'
import Link from 'next/link'
import { ModeBadge, Notice, ReasonBadge } from '@/components/admin/assistant/ui'
import { AEmpty, Card, dateTime, PageHeader, Stat } from '@/components/admin/ui'
import { aiLevelLabel, formatAiCost } from '@/lib/chat/models'
import { requireAdminPage } from '@/server/auth/current'
import { getAssistantOverview } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'AI чатбот' }

// The Messenger/Instagram chatbot has its own admin; the demo shows it on Ursgal Digital's site.
const CHATBOT_ADMIN_DEMO = 'https://www.ursgaldigital.com/chatbot'

export default async function AssistantOverviewPage() {
  const actor = await requireAdminPage('/admin/assistant', 'assistant.view')
  const { status, conversations, handovers, recentProblems, summary } = await getAssistantOverview(actor)
  const f = summary.funnel
  return (
    <>
      <PageHeader
        title="AI чатбот"
        description="Худалдааны туслах: бараа, хувилбарын үлдэгдэл, үнэ, хүргэлтийг дэлгүүрийн сангаас уншиж хариулна, баталгаажуулсан захиалгыг үүсгэнэ, хэрэгтэй үед ажилтанд шилжүүлнэ."
        actions={
          <Link href="/admin/assistant/try" className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[13.5px] font-medium text-white hover:bg-charcoal">
            Чатбот турших
          </Link>
        }
      />
      {actor.role === 'demo' && (
        <Card title="Messenger, Instagram-ийн чатбот" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <p className="max-w-2xl text-stone-600">
              Энэ туслах дэлгүүрийн сайт дээр ажилладаг. Facebook Page, Instagram-ийн мессеж, сэтгэгдэлд хариулдаг чатбот тусдаа самбартай: чатууд, захиалга, ботын мэдлэг, хариулж чадаагүй асуулт, тест чат.
            </p>
            <a href={CHATBOT_ADMIN_DEMO} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-[13.5px] font-medium hover:border-ink">
              Чатботын самбарыг үзэх ↗
            </a>
          </div>
        </Card>
      )}
      {actor.role === 'demo' && <Notice>Демо горим: жишээ яриа болон таны энэ хөтчөөс эхлүүлсэн яриа харагдана. Дэлгүүрийн туслахаас «ажилтантай холбогдох» гэж бичээд, тэр яриаг «Ажилтанд шилжүүлэх» хэсгээс хүлээн авч үзээрэй.</Notice>}

      <Card title="Одоогийн төлөв" className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <ModeBadge mode={status.mode} />
          <span>{status.reason}</span>
        </div>
        {/* AI level and spend are the owner's business; a demo visitor sees what the bot does. */}
        <dl className={`mt-4 grid gap-4 text-[13px] ${actor.role === 'demo' ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
          {actor.role !== 'demo' && (
            <>
              <div>
                <dt className="text-stone-600">AI-ийн түвшин</dt>
                <dd className="font-medium">{status.configured ? aiLevelLabel(status.model) : 'AI холбогдоогүй'}</dd>
              </div>
              <div>
                <dt className="text-stone-600">Өнөөдрийн AI зардал</dt>
                <dd className="tabular font-medium">
                  {formatAiCost(status.spentTodayUsd)} / {formatAiCost(status.budgetUsd)}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-stone-600">Чатаар захиалга</dt>
            <dd className="font-medium">{status.settings.chatOrdersEnabled ? `Нээлттэй · ${status.settings.reservationMinutes} мин нөөцлөнө` : 'Хаалттай'}</dd>
          </div>
          <div>
            <dt className="text-stone-600">Автоматаар буцаах</dt>
            <dd className="font-medium">{status.settings.handoverAutoResumeHours ? `${status.settings.handoverAutoResumeHours} цагийн дараа` : 'Хэзээ ч'}</dd>
          </div>
        </dl>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Яриа (7 хоног)" value={conversations.week} hint={`Өнөөдөр ${conversations.today}`} />
        <Stat label="Ажилтан хүлээж буй" value={conversations.waiting} tone={conversations.waiting ? 'warning' : undefined} hint={`Хариулж буй: ${conversations.taken}`} />
        <Stat label="Чатаар үүссэн захиалга (7 хоног)" value={f.chatOrdersCreated} hint={`Сагсанд нэмсэн: ${f.addedToCart}`} />
        <Stat label="Хариулж чадаагүй (7 хоног)" value={summary.unanswered} tone={summary.unanswered ? 'warning' : undefined} hint={`Каталогт байхгүй: ${summary.notInCatalogue}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Ажилтан хүлээж буй яриа" actions={<Link href="/admin/assistant/handover" className="text-[12.5px] text-stone-600 hover:text-ink">Бүгд →</Link>} padded={false}>
          {handovers.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-stone-600">Одоогоор хүлээгдэж буй хүсэлт алга.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {handovers.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                  <ReasonBadge reason={h.reason} />
                  <Link href={`/admin/assistant/conversations/${h.conversationId}`} className="min-w-0 flex-1 truncate hover:underline">
                    {h.question}
                  </Link>
                  <span className="text-[12px] text-stone-500">{dateTime.format(h.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Сүүлийн асуудал" actions={<Link href="/admin/assistant/problems" className="text-[12.5px] text-stone-600 hover:text-ink">Бүгд →</Link>} padded={false}>
          {recentProblems.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-stone-600">Сүүлийн 7 хоногт асуудал бүртгэгдээгүй.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentProblems.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                  <span className={p.level === 'error' ? 'text-danger' : 'text-warning'}>{p.code}</span>
                  <span className="flex-1 text-stone-600">{p.source}</span>
                  <span className="text-[12px] text-stone-500">{dateTime.format(p.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Худалдан авалтын урсгал (7 хоног)" className="mt-4">
        {summary.replies === 0 ? (
          <AEmpty title="Энэ хугацаанд хариулт алга" />
        ) : (
          <ol className="grid gap-3 text-[13px] sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['Барааны асуулт', f.productQuestions],
              ['Авах хүсэл', f.purchaseIntent],
              ['Үнийн санал', f.offers],
              ['Сагсанд нэмсэн', f.addedToCart],
              ['Чат захиалга эхэлсэн', f.chatOrdersStarted],
              ['Захиалга үүссэн', f.chatOrdersCreated],
            ].map(([label, n]) => (
              <li key={label as string} className="rounded-lg bg-paper px-3 py-2.5">
                <span className="block text-[11.5px] text-stone-600">{label}</span>
                <span className="tabular text-[18px] font-medium">{n}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  )
}
