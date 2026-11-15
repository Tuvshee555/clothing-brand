// Shared pieces of the AI Chatbot admin section (server-safe).
import { Bot, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { RichText } from '@/components/store/assistant-widget'
import { HANDOFF_REASON_LABELS, HANDOVER_STATUS_LABELS, isHandoffReason, type HandoverStatus } from '@/lib/chat/handover'
import { INTENT_LABELS } from '@/lib/chat/analytics'
import { cn } from '@/lib/cn'
import { dateTime } from '../ui'

const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap'

export function ReasonBadge({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null
  const tone = reason === 'complaint' || reason === 'payment_claim' || reason === 'order_problem' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
  return <span className={cn(pill, tone)}>{isHandoffReason(reason) ? HANDOFF_REASON_LABELS[reason] : reason}</span>
}

export function HandoverStatusBadge({ status }: { status: string }) {
  const tone = status === 'open' ? 'bg-warning-soft text-warning' : status === 'taken' ? 'bg-info-soft text-info' : 'bg-success-soft text-success'
  return <span className={cn(pill, tone)}>{HANDOVER_STATUS_LABELS[status as HandoverStatus] ?? status}</span>
}

export function ConversationStateBadge({ paused, needsHuman }: { paused: boolean; needsHuman: boolean }) {
  if (paused) return <span className={cn(pill, 'bg-info-soft text-info')}>Ажилтан хариулж буй</span>
  if (needsHuman) return <span className={cn(pill, 'bg-warning-soft text-warning')}>Ажилтан хүлээж буй</span>
  return <span className={cn(pill, 'bg-success-soft text-success')}>Туслах хариулж буй</span>
}

export function ModeBadge({ mode }: { mode: 'ai' | 'rules' | 'off' }) {
  const label = mode === 'ai' ? 'AI горим' : mode === 'rules' ? 'Каталогийн горим' : 'Унтраастай'
  const tone = mode === 'ai' ? 'bg-info-soft text-info' : mode === 'rules' ? 'bg-paper-2 text-charcoal' : 'bg-danger-soft text-danger'
  return <span className={cn(pill, tone)}>{label}</span>
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return <p className={cn('mb-4 rounded-lg px-3 py-2 text-[12.5px]', tone === 'info' ? 'bg-info-soft text-info' : 'bg-warning-soft text-warning')}>{children}</p>
}

export const intentLabel = (intent: string | undefined) => (intent ? (INTENT_LABELS[intent] ?? intent) : '—')

type TranscriptMessage = { id: string; role: string; text: string; createdAt: Date; metadata: unknown }

/** The full chat as staff read it, with what the assistant did on each reply. */
export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  if (messages.length === 0) return <p className="text-[13px] text-stone-600">Мессеж алга.</p>
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const meta = (m.metadata ?? {}) as { intent?: string; mode?: string; events?: string[]; staffLabel?: string; script?: string; orderNumber?: string | null }
        const customer = m.role === 'customer'
        return (
          <li key={m.id} className={cn('flex flex-col', customer ? 'items-start' : 'items-end')}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
              {customer ? (
                <span>Худалдан авагч{meta.script === 'latin' ? ' · латин үсгээр' : ''}</span>
              ) : m.role === 'staff' ? (
                <span className="inline-flex items-center gap-1 text-accent">
                  <UserRound className="h-3 w-3" /> {meta.staffLabel ?? 'Ажилтан'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" /> Туслах · {meta.mode === 'ai' ? 'AI' : 'дүрэм'} · {intentLabel(meta.intent)}
                </span>
              )}
              <time dateTime={m.createdAt.toISOString()}>{dateTime.format(m.createdAt)}</time>
            </div>
            <div className={cn('max-w-[min(560px,92%)] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed', customer ? 'bg-paper-2' : m.role === 'staff' ? 'border border-accent/30 bg-accent-soft' : 'border border-stone-200 bg-white')}>
              {customer ? m.text : <RichText text={m.text} />}
            </div>
            {!!meta.events?.length && (
              <p className="mt-1 max-w-[560px] text-right text-[10.5px] text-stone-500">
                {meta.events.join(' · ')}
                {meta.orderNumber && (
                  <>
                    {' · '}
                    <Link href={`/admin/orders?q=${meta.orderNumber}`} className="underline">
                      {meta.orderNumber}
                    </Link>
                  </>
                )}
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] text-stone-600">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  )
}
