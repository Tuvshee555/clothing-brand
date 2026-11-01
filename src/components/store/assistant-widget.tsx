'use client'

import { ArrowUp, MessageCircle, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Spinner } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'

type Card = { name: string; slug: string; url: string; price: number; maxPrice: number; availability: string; image: string | null; imageAlt: string }
type Message = { role: 'user' | 'assistant'; content: string; products?: Card[]; mode?: 'ai' | 'catalog'; error?: boolean }

const STORAGE_KEY = 'manan.assistant'
const STARTERS = ['Ямар hoodie байна?', 'Хар hoodie L размер байгаа юу?', '200,000₮-өөс доош юу байна?', 'Өвөлд ямар хувцас тохирох вэ?', 'Хүргэлтийн нөхцөл ямар вэ?']

/** Minimal, safe rendering: **bold**, [label](/internal-link), "- " bullets, paragraphs. */
function RichText({ text, onNavigate }: { text: string; onNavigate: () => void }) {
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
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `p${bi}-${li}`)}</Fragment>)}</p>
      })}
    </div>
  )
}

function loadHistory(): Message[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Message[]) : []
    return Array.isArray(parsed) ? parsed.slice(-20) : []
  } catch {
    return []
  }
}

export function AssistantWidget({ storeName }: { storeName: string }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const pathname = usePathname()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pageSlug = /^\/products\/([a-z0-9-]+)/.exec(pathname)?.[1] ?? null

  useEffect(() => {
    if (!open || loaded) return
    // Restoring the conversation is a one-time read of browser storage when the panel first opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadHistory())
    setLoaded(true)
  }, [open, loaded])

  useEffect(() => {
    if (!loaded) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)))
    } catch {
      // Storage may be unavailable; the conversation just won't survive navigation.
    }
  }, [messages, loaded])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const send = async (text: string) => {
    const content = text.trim().slice(0, 600)
    if (!content || pending) return
    const next: Message[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setPending(true)
    const lastProducts = [...messages].reverse().find((m) => m.role === 'assistant' && m.products?.length)?.products ?? []
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.filter((m) => !m.error).slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })),
          pageSlug,
          contextSlugs: lastProducts.map((p) => p.slug).slice(0, 6),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setMessages((m) => [...m, { role: 'assistant', content: data?.error ?? 'Туслах түр ажиллахгүй байна. Дахин оролдоно уу.', error: true }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply, products: data.products, mode: data.mode }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Сүлжээний алдаа гарлаа. Дахин оролдоно уу.', error: true }])
    } finally {
      setPending(false)
    }
  }

  const lastMode = [...messages].reverse().find((m) => m.mode)?.mode

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
        </button>
      )}
      {open && (
        <section
          className="fixed inset-x-0 bottom-0 z-[55] flex h-[min(640px,88dvh)] flex-col border border-stone-200 bg-paper shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
          aria-label="Худалдааны туслах"
        >
          <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{storeName} туслах</p>
              <p className="text-[11.5px] text-stone-600">
                {lastMode === 'ai' ? 'AI · мэдээллийг дэлгүүрийн сангаас уншина' : 'Сангаас шууд хайна · үнэ, үлдэгдэл бодит цагийн'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center hover:bg-paper-2" aria-label="Туслах хаах">
              <X className="h-4.5 w-4.5" strokeWidth={1.5} />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed" aria-live="polite">
            <div className="max-w-[92%] bg-white px-3.5 py-3">
              Сайн байна уу! Бараа, өнгө, хэмжээ, үлдэгдэл, хүргэлт, буцаалтын талаар асуугаарай. Би дэлгүүрийн сангаас шалгаж хариулна.
            </div>
            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="border border-stone-300 bg-paper px-3 py-1.5 text-left text-[12.5px] hover:border-ink">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn('max-w-[92%] px-3.5 py-2.5', m.role === 'user' ? 'bg-ink text-white' : m.error ? 'bg-danger-soft text-danger' : 'bg-white')}>
                  {m.role === 'assistant' ? <RichText text={m.content} onNavigate={() => window.innerWidth < 640 && setOpen(false)} /> : m.content}
                </div>
                {m.products && m.products.length > 0 && (
                  <div className="mt-2 grid w-full grid-cols-2 gap-2">
                    {m.products.slice(0, 4).map((p) => (
                      <Link key={p.slug} href={p.url} className="group flex gap-2 border border-stone-200 bg-white p-1.5 hover:border-ink" onClick={() => window.innerWidth < 640 && setOpen(false)}>
                        <span className="relative aspect-[4/5] w-12 shrink-0 bg-bone">
                          {p.image && <Image src={p.image} alt={p.imageAlt} fill sizes="48px" className="object-cover" />}
                        </span>
                        <span className="min-w-0 py-0.5 text-[11.5px] leading-snug">
                          <span className="line-clamp-2 group-hover:underline">{p.name}</span>
                          <span className="tabular mt-0.5 block text-stone-600">
                            {p.price === p.maxPrice ? formatMoney(p.price) : `${formatMoney(p.price)}+`}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-stone-600">
                <Spinner /> Сангаас шалгаж байна…
              </div>
            )}
          </div>

          <form
            className="border-t border-stone-200 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
          >
            <div className="flex items-end gap-2 border border-stone-300 bg-white px-3 py-2 focus-within:border-ink">
              <label htmlFor="assistant-input" className="sr-only">
                Асуулт
              </label>
              <textarea
                ref={inputRef}
                id="assistant-input"
                rows={1}
                value={input}
                maxLength={600}
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
              Демо туслах. Захиалга үүсгэхгүй — худалдан авахдаа бүтээгдэхүүний хуудаснаас сагсанд нэмнэ. Үнэ, үлдэгдлийг хуудаснаас дахин шалгаарай.
            </p>
          </form>
        </section>
      )}
    </>
  )
}
