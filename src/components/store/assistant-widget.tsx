'use client'

import { ArrowUp, MessageCircle, RotateCcw, ShoppingBag, UserRound, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useCartDrawer } from '@/components/store/cart-drawer'
import { Spinner } from '@/components/ui/feedback'
import type { ChatAction, ChatView, PublicChatMessage } from '@/lib/assistant/types'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { addToCartAction } from '@/server/actions/store'

// The conversation id is not a secret: the conversation belongs to this
// browser's httpOnly visitor cookie, which the server checks on every request.
const STORAGE_KEY = 'manan.assistant.conversation'
const STARTERS = ['Ямар hoodie байна?', 'Хар hoodie L размер байгаа юу?', '200,000₮-өөс доош ямар цамц байна?', 'Хүргэлт хэд хоног вэ?', 'Яаж захиалах вэ?']
/** While a person is involved the widget checks for replies: 5 s, slowing to 30 s, for at most 10 minutes. */
const POLL_START_MS = 5_000
const POLL_MAX_MS = 30_000
const POLL_FOR_MS = 10 * 60_000

/** Minimal, safe rendering: **bold**, [label](/internal-link), "- " bullets, paragraphs. */
export function RichText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const blocks = text.split(/\n{2,}/)
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(\s*(\/[^)\s]*)\s*\)/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[1]) out.push(<strong key={`${key}-b${i++}`}>{m[1]}</strong>)
      else
        out.push(
          <Link key={`${key}-l${i++}`} href={m[3]} onClick={onNavigate} className="underline underline-offset-2">
            {m[2]}
          </Link>,
        )
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split('\n')
        const bullets = lines.filter((l) => l.startsWith('- '))
        if (bullets.length && bullets.length === lines.length - (lines[0].startsWith('- ') ? 0 : 1)) {
          const head = lines[0].startsWith('- ') ? null : lines[0]
          return (
            <Fragment key={bi}>
              {head && <p>{inline(head, `h${bi}`)}</p>}
              <ul className="space-y-1">
                {bullets.map((l, li) => (
                  <li key={li} className="flex gap-2">
                    <span aria-hidden>·</span>
                    <span>{inline(l.slice(2), `b${bi}-${li}`)}</span>
                  </li>
                ))}
              </ul>
            </Fragment>
          )
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `p${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

type Local = PublicChatMessage & { pending?: boolean; failed?: { clientMessageId: string } }

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
function storeId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage may be unavailable: the conversation just won't survive a reload.
  }
}

/**
 * The storefront chat. `variant="test"` is the admin's "try the chatbot": the
 * same rendering, sending through a server action that never creates real
 * orders or cart changes.
 */
export function ChatThread({
  view,
  messages,
  pending,
  onSend,
  onAction,
  onNavigate,
}: {
  view: ChatView | null
  messages: Local[]
  pending: boolean
  onSend: (text: string, retryId?: string) => void
  onAction: (action: ChatAction) => void
  onNavigate?: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, pending])
  const lastAssistant = [...messages].reverse().find((m) => m.role !== 'customer')
  return (
    <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
      {messages.length === 0 && (
        <>
          <div className="max-w-[92%] bg-white px-3.5 py-3">Сайн байна уу! Бараа, өнгө, хэмжээ, үлдэгдэл, хүргэлт, буцаалтын талаар асуугаарай. Би дэлгүүрийн сангаас шалгаж хариулна.</div>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => onSend(s)} className="border border-stone-300 bg-paper px-3 py-1.5 text-left text-[12.5px] hover:border-ink">
                {s}
              </button>
            ))}
          </div>
        </>
      )}
      {messages.map((m) => (
        <div key={m.id} className={cn('flex flex-col', m.role === 'customer' ? 'items-end' : 'items-start')}>
          {m.role === 'staff' && (
            <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.1em] text-accent">
              <UserRound className="h-3 w-3" /> Ажилтан
            </span>
          )}
          <div
            className={cn(
              'max-w-[92%] px-3.5 py-2.5',
              m.role === 'customer' ? 'bg-ink text-white' : m.role === 'staff' ? 'border border-accent/30 bg-accent-soft' : 'bg-white',
              m.pending && 'opacity-60',
            )}
          >
            {m.role === 'customer' ? m.text : <RichText text={m.text} onNavigate={onNavigate} />}
          </div>
          {m.failed && (
            <button type="button" onClick={() => onSend(m.text, m.failed!.clientMessageId)} className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-danger underline">
              <RotateCcw className="h-3 w-3" /> Илгээгдсэнгүй — дахин оролдох
            </button>
          )}
          {m.cards && m.cards.length > 0 && (
            <div className="mt-2 grid w-full grid-cols-2 gap-2">
              {m.cards.slice(0, 4).map((p) => (
                <Link key={p.slug} href={p.url} className="group flex gap-2 border border-stone-200 bg-white p-1.5 hover:border-ink" onClick={onNavigate}>
                  <span className="relative aspect-[4/5] w-12 shrink-0 bg-bone">{p.image && <Image src={p.image} alt={p.imageAlt} fill sizes="48px" className="object-cover" />}</span>
                  <span className="min-w-0 py-0.5 text-[11.5px] leading-snug">
                    <span className="line-clamp-2 group-hover:underline">{p.name}</span>
                    <span className="tabular mt-0.5 block text-stone-600">{p.price === p.maxPrice ? formatMoney(p.price) : `${formatMoney(p.price)}+`}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
          {m.actions && m.actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {m.actions.map((a, i) =>
                a.type === 'link' ? (
                  <Link key={i} href={a.href} onClick={onNavigate} className="border border-stone-300 bg-white px-3 py-1.5 text-[12px] hover:border-ink">
                    {a.label}
                  </Link>
                ) : (
                  <button
                    key={i}
                    type="button"
                    disabled={pending}
                    onClick={() => onAction(a)}
                    className="inline-flex items-center gap-1.5 bg-ink px-3 py-1.5 text-[12px] text-white hover:bg-charcoal disabled:opacity-50"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" /> {a.label}
                  </button>
                ),
              )}
            </div>
          )}
          {m.id === lastAssistant?.id && m.suggestions && m.suggestions.length > 0 && !view?.paused && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.suggestions.map((s) => (
                <button key={s} type="button" disabled={pending} onClick={() => onSend(s)} className="border border-stone-300 bg-paper px-2.5 py-1 text-[12px] hover:border-ink disabled:opacity-50">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {pending && (
        <div className="flex items-center gap-2 text-stone-600">
          <Spinner /> {view?.paused ? 'Илгээж байна…' : 'Сангаас шалгаж байна…'}
        </div>
      )}
    </div>
  )
}

export function AssistantWidget({ storeName }: { storeName: string }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ChatView | null>(null)
  const [messages, setMessages] = useState<Local[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const cart = useCartDrawer()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pageSlug = /^\/products\/([a-z0-9-]+)/.exec(pathname)?.[1] ?? null
  const pollSince = useRef(0)

  const apply = useCallback((next: ChatView) => {
    setView(next)
    setMessages(next.messages)
    storeId(next.conversationId)
  }, [])

  // Restore this browser's conversation the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return
    const id = readStoredId()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(true)
    if (!id) return
    fetch(`/api/assistant?c=${encodeURIComponent(id)}`)
      .then(async (res) => (res.ok ? apply((await res.json()) as ChatView) : storeId(null)))
      .catch(() => undefined)
  }, [open, loaded, apply])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // A person is involved: check for their replies, slowing down, only while the panel is open and visible.
  const humanActive = !!view?.humanActive
  const conversationId = view?.conversationId
  useEffect(() => {
    if (!open || !humanActive || !conversationId) return
    let delay = POLL_START_MS
    let timer: ReturnType<typeof setTimeout>
    let stopped = false
    pollSince.current = Date.now()
    const tick = async () => {
      if (stopped) return
      if (Date.now() - pollSince.current > POLL_FOR_MS) return
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(`/api/assistant?c=${encodeURIComponent(conversationId)}`)
          if (res.ok && !stopped) {
            const next = (await res.json()) as ChatView
            setView(next)
            setMessages((current) => (current.some((m) => m.pending || m.failed) ? current : next.messages))
          }
        } catch {
          // Offline for a moment: try again later.
        }
      }
      delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.5))
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, delay)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [open, humanActive, conversationId])

  const send = async (raw: string, retryId?: string) => {
    const text = raw.trim().slice(0, 1200)
    if (!text || pending) return
    const clientMessageId = retryId ?? newId()
    setInput('')
    setNotice(null)
    setPending(true)
    setMessages((m) => [...m.filter((x) => x.failed?.clientMessageId !== clientMessageId), { id: `local-${clientMessageId}`, role: 'customer', text, createdAt: new Date().toISOString(), pending: true }])
    pollSince.current = Date.now()
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: view?.conversationId ?? readStoredId(), clientMessageId, text, pageSlug }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.messages) {
        setNotice(data?.error ?? 'Туслах түр ажиллахгүй байна. Дахин оролдоно уу.')
        setMessages((m) => m.map((x) => (x.id === `local-${clientMessageId}` ? { ...x, pending: false, failed: { clientMessageId } } : x)))
      } else {
        apply(data as ChatView)
        if ((data as ChatView).cartChanged) router.refresh()
      }
    } catch {
      setNotice('Сүлжээний алдаа гарлаа. Дахин оролдоно уу.')
      setMessages((m) => m.map((x) => (x.id === `local-${clientMessageId}` ? { ...x, pending: false, failed: { clientMessageId } } : x)))
    } finally {
      setPending(false)
    }
  }

  const onAction = async (action: ChatAction) => {
    if (action.type !== 'add_to_cart') return
    setPending(true)
    setNotice(null)
    const res = await addToCartAction(action.variantId, action.quantity)
    setPending(false)
    if (res.ok) cart.open(res.data.cart, `${res.data.added} сагсанд нэмэгдлээ`)
    else setNotice(res.error)
  }

  const restart = () => {
    storeId(null)
    setView(null)
    setMessages([])
    setNotice(null)
  }
  const closeOnMobile = () => window.innerWidth < 640 && setOpen(false)

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-ink px-4 py-3 text-[12px] font-medium uppercase tracking-[0.12em] text-white shadow-lg transition hover:bg-charcoal sm:bottom-6 sm:right-6"
          aria-label="Худалдааны туслах нээх"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.6} /> Туслах
          {humanActive && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Ажилтан холбогдсон" />}
        </button>
      )}
      {open && (
        <section className="fixed inset-x-0 bottom-0 z-[55] flex h-[min(660px,88dvh)] flex-col border border-stone-200 bg-paper shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]" aria-label="Худалдааны туслах">
          <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{storeName} туслах</p>
              <p className="text-[11.5px] text-stone-600">Үнэ, үлдэгдлийг дэлгүүрийн сангаас шууд уншина</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button type="button" onClick={restart} className="grid h-9 w-9 place-items-center hover:bg-paper-2" aria-label="Шинэ яриа эхлэх" title="Шинэ яриа">
                  <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center hover:bg-paper-2" aria-label="Туслах хаах">
                <X className="h-4.5 w-4.5" strokeWidth={1.5} />
              </button>
            </div>
          </header>
          {view && !view.enabled && <p className="border-b border-stone-200 bg-warning-soft px-4 py-2 text-[12px] text-warning">Туслах түр унтраалттай. Мессеж үлдээвэл ажилтан энд хариулна.</p>}
          {view?.paused ? (
            <p className="border-b border-stone-200 bg-accent-soft px-4 py-2 text-[12px] text-accent">Ажилтан холбогдсон — хариулт энд гарна.</p>
          ) : (
            view?.humanActive && <p className="border-b border-stone-200 bg-info-soft px-4 py-2 text-[12px] text-info">Ажилтанд мэдэгдсэн. Хүлээх хооронд надаас асууж болно.</p>
          )}

          <ChatThread view={view} messages={messages} pending={pending} onSend={send} onAction={onAction} onNavigate={closeOnMobile} />

          <form
            className="border-t border-stone-200 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            {notice && (
              <p role="alert" className="mb-2 text-[12px] text-danger">
                {notice}
              </p>
            )}
            <div className="flex items-end gap-2 border border-stone-300 bg-white px-3 py-2 focus-within:border-ink">
              <label htmlFor="assistant-input" className="sr-only">
                Асуулт
              </label>
              <textarea
                ref={inputRef}
                id="assistant-input"
                rows={1}
                value={input}
                maxLength={1200}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(input)
                  }
                }}
                placeholder="Жишээ: хар hoodie L размер байгаа юу?"
                className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-[13.5px] outline-none placeholder:text-stone-500"
              />
              <button type="submit" disabled={pending || !input.trim()} className="grid h-8 w-8 shrink-0 place-items-center bg-ink text-white disabled:opacity-30" aria-label="Илгээх">
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-stone-500">
              Демо туслах. Чатаар захиалахад таны «тийм» баталгаажуулалтын дараа л захиалга үүснэ; төлбөр симуляц, мөнгө шилжихгүй. Хүн хэрэгтэй бол «ажилтантай холбогдох» гэж бичээрэй.
            </p>
          </form>
        </section>
      )}
    </>
  )
}
