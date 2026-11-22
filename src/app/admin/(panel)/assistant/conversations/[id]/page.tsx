import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConversationActions, NotesForm } from '@/components/admin/assistant/conversation-actions'
import { ConversationStateBadge, HandoverStatusBadge, KeyValue, ReasonBadge, Transcript } from '@/components/admin/assistant/ui'
import { Card, dateTime, OrderStatusBadge, PageHeader, PaymentBadge, SampleTag } from '@/components/admin/ui'
import { sizeLabel } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import type { OrderStatus, PaymentStatus } from '@/lib/orders'
import { formatPhone } from '@/lib/phone'
import { hasPermission } from '@/lib/roles'
import { requireAdminPage } from '@/server/auth/current'
import { getConversationDetail } from '@/server/queries/assistant-admin'
import { markConversationRead } from '@/server/services/assistant-admin'
import { db } from '@/server/db'

export const metadata: Metadata = { title: 'Яриа', robots: { index: false } }

const DRAFT_STEPS: Record<string, string> = {
  product: 'бараа сонгож буй',
  variant: 'өнгө, хэмжээ сонгож буй',
  offer: 'үнийн санал авсан',
  contact: 'нэр, утас оруулж буй',
  address: 'хаяг оруулж буй',
  confirm: 'баталгаажуулалт хүлээж буй',
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await requireAdminPage(`/admin/assistant/conversations/${id}`, 'assistant.view')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const data = await getConversationDetail(actor, id)
  if (!data) notFound()
  const c = data.conversation
  if (data.canAct) await markConversationRead({ db, actor, now: new Date() }, c.id)
  const canReply = data.canAct && hasPermission(actor.role, 'assistant.reply')
  const lockedReason =
    c.channel === 'sample'
      ? 'Энэ бол жишээ яриа — зөвхөн харна. Дэлгүүрийн туслахад өөрөө бичиж «ажилтантай холбогдох» гэвэл тэр яриаг хүлээн авч хариулж болно.'
      : 'Демо горимд зөвхөн та өөрөө энэ хөтчөөс эхлүүлсэн яриаг хүлээн авч, хариулна.'
  const activeHandover = data.handovers.find((h) => h.status !== 'resolved')

  return (
    <>
      <PageHeader
        back={{ href: '/admin/assistant/conversations', label: 'Яриа' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.customerName ?? 'Нэргүй харилцагч'} <ConversationStateBadge paused={c.paused} needsHuman={c.needsHuman} />
            {c.channel === 'sample' && <SampleTag />}
          </span>
        }
        description={`Эхэлсэн: ${dateTime.format(c.createdAt)} · ${c.messageCount} мессеж${c.paused && data.takenOverByName ? ` · ${data.takenOverByName} хариулж байна` : ''}`}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Яриа">
          <Transcript messages={data.messages} />
        </Card>
        <div className="space-y-4">
          <Card title="Ажилтны үйлдэл">
            <ConversationActions conversationId={c.id} paused={c.paused} canAct={canReply} lockedReason={lockedReason} />
          </Card>
          <Card title="Юуны тухай ярьсан">
            <dl className="space-y-3">
              {activeHandover && (
                <KeyValue label="Ажилтанд шилжүүлсэн шалтгаан">
                  <span className="flex flex-wrap items-center gap-2">
                    <ReasonBadge reason={activeHandover.reason} /> <HandoverStatusBadge status={activeHandover.status} />
                  </span>
                  <span className="mt-1 block text-stone-600">«{activeHandover.question}» · {dateTime.format(activeHandover.createdAt)}</span>
                </KeyValue>
              )}
              <KeyValue label="Харилцагч">
                {c.customerName ?? '—'}
                {c.customerPhone && ` · ${formatPhone(c.customerPhone)}`}
              </KeyValue>
              <KeyValue label="Сонирхсон бараа">
                {data.products.length ? (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {data.products.map((p) => (
                      <Link key={p.id} href={`/admin/products/${p.id}`} className="underline underline-offset-2">
                        {p.name}
                      </Link>
                    ))}
                  </span>
                ) : (
                  '—'
                )}
              </KeyValue>
              <KeyValue label="Сонгосон хувилбар">{data.variant ? `${data.variant.product}${data.variant.color ? ` · ${data.variant.color}` : ''}${data.variant.size ? ` / ${sizeLabel(data.variant.size)}` : ''}` : '—'}</KeyValue>
              <KeyValue label="Худалдан авах хүсэл">
                {data.purchaseIntent ? 'Тийм' : 'Илрээгүй'}
                {data.draft && ` · чат захиалга: ${DRAFT_STEPS[data.draft.step] ?? data.draft.step}`}
              </KeyValue>
            </dl>
          </Card>
          <Card title="Захиалга" padded={false}>
            {data.orders.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-stone-600">Энэ харилцагчийн захиалга алга.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {data.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[13px]">
                    <Link href={`/admin/orders/${o.id}`} className="font-medium hover:underline">
                      {o.number}
                    </Link>
                    {o.source === 'assistant' && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] text-info">Чатаар</span>}
                    <OrderStatusBadge status={o.status as OrderStatus} />
                    <PaymentBadge status={o.paymentStatus as PaymentStatus} />
                    <span className="tabular ml-auto">{formatMoney(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Тэмдэглэл">
            <NotesForm conversationId={c.id} initial={c.notes} canAct={canReply} />
          </Card>
          {data.handovers.length > 0 && (
            <Card title="Шилжүүлгийн түүх" padded={false}>
              <ul className="divide-y divide-stone-100">
                {data.handovers.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-[12.5px]">
                    <ReasonBadge reason={h.reason} /> <HandoverStatusBadge status={h.status} />
                    <span className="ml-auto text-stone-500">
                      {dateTime.format(h.createdAt)}
                      {h.resolvedAt && ` → ${dateTime.format(h.resolvedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
