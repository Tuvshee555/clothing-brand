import type { Metadata } from 'next'
import Link from 'next/link'
import { AEmpty, dateTime, PageHeader, TableWrap, Td, Th } from '@/components/admin/ui'
import { ROLE_LABELS, type Role } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { listActivity } from '@/server/queries/assistant-admin'

export const metadata: Metadata = { title: 'Үйл явдлын түүх' }

const ACTION_LABELS: Record<string, string> = {
  'assistant.settings_updated': 'Тохиргоо өөрчилсөн',
  'assistant.faq_saved': 'Асуулт, хариулт хадгалсан',
  'assistant.faq_deleted': 'Асуулт, хариулт устгасан',
  'conversation.taken_over': 'Яриаг хүлээн авсан',
  'conversation.released': 'Туслах руу буцаасан',
  'conversation.staff_reply': 'Ажилтан хариулсан',
  'conversation.notes_updated': 'Тэмдэглэл хадгалсан',
  'conversation.auto_released': 'Автоматаар туслах руу буцсан',
  'order.created_by_assistant': 'Туслах захиалга үүсгэсэн',
}


/** Settings names as the settings page calls them — never the stored keys. */
const SETTING_LABELS: Record<string, string> = {
  enabled: 'туслах асаалттай эсэх',
  aiEnabled: 'AI ашиглах',
  aiModel: 'AI-ийн түвшин',
  aiDailyBudgetUsd: 'өдрийн AI зардлын хязгаар',
  chatOrdersEnabled: 'чатаар захиалга',
  reservationMinutes: 'нөөцлөх хугацаа',
  maxActiveOrders: 'төлөгдөөгүй захиалгын тоо',
  maxQuantityPerItem: 'нэг бараанаас дээд тоо',
  handoverAutoResumeHours: 'туслах руу буцаах хугацаа',
  showExactStock: 'үлдэгдлийн яг тоо',
  greeting: 'мэндчилгээ',
}

function detail(action: string, metadata: unknown): string {
  const m = (metadata ?? {}) as Record<string, unknown>
  if (action === 'assistant.settings_updated' && Array.isArray(m.changed)) return m.changed.length ? `Өөрчилсөн: ${m.changed.map((k) => SETTING_LABELS[String(k)] ?? 'бусад тохиргоо').join(', ')}` : 'Өөрчлөлтгүй'
  if (typeof m.question === 'string') return `«${m.question}»`
  if (action === 'conversation.auto_released' && typeof m.hours === 'number') return `${m.hours} цаг чимээгүй байсны дараа`
  if (typeof m.length === 'number') return `${m.length} тэмдэгт`
  return ''
}

export default async function ActivityPage() {
  const actor = await requireAdminPage('/admin/assistant/activity', 'assistant.view')
  const rows = await listActivity(actor)
  return (
    <>
      <PageHeader title="Үйл явдлын түүх" description="Хэн, хэзээ чатботын тохиргоо, мэдлэгийг өөрчилж, яриа хүлээн авч, хариулж, буцаасан; туслах ямар захиалга үүсгэсэн." />
      {rows.length === 0 ? (
        <AEmpty title="Түүх хоосон" />
      ) : (
        <TableWrap>
          <thead className="border-b border-stone-200 bg-paper">
            <tr>
              <Th>Огноо</Th>
              <Th>Хэн</Th>
              <Th>Үйлдэл</Th>
              <Th>Дэлгэрэнгүй</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-stone-600">{dateTime.format(r.createdAt)}</Td>
                <Td>{r.actorName ?? (r.actorRole === 'assistant' ? 'Худалдааны туслах' : r.actorRole === 'system' ? 'Систем' : ROLE_LABELS[r.actorRole as Role] ?? r.actorRole)}</Td>
                <Td>{ACTION_LABELS[r.action] ?? r.action}</Td>
                <Td className="text-stone-600">
                  {r.entityType === 'conversation' && r.entityId ? (
                    <Link href={`/admin/assistant/conversations/${r.entityId}`} className="underline underline-offset-2">
                      Яриа
                    </Link>
                  ) : r.entityType === 'order' && r.entityId ? (
                    <Link href={`/admin/orders?q=${r.entityId}`} className="underline underline-offset-2">
                      {r.entityId}
                    </Link>
                  ) : null}{' '}
                  {detail(r.action, r.metadata)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  )
}
