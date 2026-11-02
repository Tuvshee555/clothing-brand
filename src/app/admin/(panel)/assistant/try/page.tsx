import type { Metadata } from 'next'
import { TestChat } from '@/components/admin/assistant/test-chat'
import { ModeBadge } from '@/components/admin/assistant/ui'
import { Card, PageHeader } from '@/components/admin/ui'
import { chatView } from '@/server/assistant'
import { requireAdminPage } from '@/server/auth/current'
import { db } from '@/server/db'
import { getAssistantStatus, latestTestConversation } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Чатбот турших' }

const TRY_THESE = [
  'Хар hoodie L размер байгаа юу?',
  'ene tsamts hed ve',
  '200,000₮-өөс доош ямар цамц байна?',
  'Шулуун жинс 30 размер бий юу?',
  'Хүргэлт хэд хоног вэ?',
  'Хар hoodie L авъя → энд захиалъя',
  'Ажилтантай холбогдмоор байна',
]

export default async function TryChatbotPage() {
  const actor = await requireAdminPage('/admin/assistant/try', 'assistant.view')
  const [status, conversation] = await Promise.all([getAssistantStatus(), latestTestConversation(actor)])
  const initial = conversation ? await chatView(db, conversation, status.settings.enabled) : null
  return (
    <>
      <PageHeader title="Чатбот турших" description="Дэлгүүрийн туслахтай яг ижил хөдөлгүүр, ижил сан. Туршилтын захиалга бодитоор үүсэхгүй, үлдэгдэл, сагс өөрчлөгдөхгүй, яриа жагсаалтад орохгүй." />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <TestChat initial={initial} />
        <Card title="Юу туршиж болох вэ">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <ModeBadge mode={status.mode} /> <span className="text-stone-600">{status.reason}</span>
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {TRY_THESE.map((q) => (
              <li key={q} className="rounded-lg bg-paper px-3 py-2">
                {q}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-stone-500">Латин үсгээр, товчилж бичсэн ч ойлгоно. Үнэ, үлдэгдлийг өөрчлөөд («Үлдэгдэл» хэсэг) дахин асуувал хариулт шууд өөрчлөгдөнө.</p>
        </Card>
      </div>
    </>
  )
}
