'use client'

import { ArrowUpRight, Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { BRAND } from '@/lib/brand'

type NavItem = { slug: string; name: string }

const POPULAR = ['Hoodie', 'Ноолуур', 'Жинс', 'Пальто', 'Цагаан цамц']

export function SearchButton() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const go = (term: string) => {
    const value = term.trim()
    if (!value) return
    setOpen(false)
    router.push(`/shop?q=${encodeURIComponent(value)}`)
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label="Хайх">
        <Search className="h-[19px] w-[19px]" strokeWidth={1.5} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Бүтээгдэхүүн хайх">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative animate-fade-in border-b border-stone-200 bg-paper">
            <form
              className="container-page flex h-20 items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                go(q)
              }}
            >
              <Search className="h-5 w-5 shrink-0 text-stone-500" strokeWidth={1.5} />
              <label htmlFor="site-search" className="sr-only">
                Бүтээгдэхүүн хайх
              </label>
              <input
                ref={inputRef}
                id="site-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Юу хайж байна вэ? — hoodie, ноолуур, хар жинс…"
                className="h-12 flex-1 bg-transparent text-lg outline-none placeholder:text-stone-500"
                maxLength={80}
                autoComplete="off"
              />
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label="Хаах">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </form>
            <div className="container-page flex flex-wrap items-center gap-2 pb-5">
              <span className="eyebrow mr-1 text-stone-600">Түгээмэл</span>
              {POPULAR.map((term) => (
                <button key={term} type="button" onClick={() => go(term)} className="border border-stone-300 px-3 py-1.5 text-xs hover:border-ink">
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function MobileMenu({ categories, collections }: { categories: NavItem[]; collections: NavItem[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])
  const close = () => setOpen(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center hover:bg-paper-2 lg:hidden" aria-label="Цэс нээх" aria-expanded={open}>
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Цэс">
          <div className="absolute inset-0 animate-fade-in bg-ink/40" onClick={close} aria-hidden />
          <nav className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-paper">
            <div className="flex h-16 items-center justify-between border-b border-stone-200 px-5">
              <span className="wordmark text-base">{BRAND.name}</span>
              <button type="button" onClick={close} className="grid h-10 w-10 place-items-center hover:bg-paper-2" aria-label="Цэс хаах">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>
            <div className="space-y-8 px-5 py-6">
              <ul className="space-y-3 text-lg">
                <li><Link href="/collections/new" onClick={close}>Шинэ ирэлт</Link></li>
                <li><Link href="/collections/women" onClick={close}>Эмэгтэй</Link></li>
                <li><Link href="/collections/men" onClick={close}>Эрэгтэй</Link></li>
                <li><Link href="/shop" onClick={close}>Бүх бараа</Link></li>
              </ul>
              <div>
                <p className="eyebrow mb-3 text-stone-600">Ангилал</p>
                <ul className="space-y-2.5">
                  {categories.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/shop/${c.slug}`} onClick={close}>{c.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-3 text-stone-600">Цуглуулга</p>
                <ul className="space-y-2.5">
                  {collections.map((c) => (
                    <li key={c.slug}>
                      <Link href={`/collections/${c.slug}`} onClick={close}>{c.name}</Link>
                    </li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-2.5 border-t border-stone-200 pt-6 text-sm">
                <li><Link href="/orders" onClick={close}>Миний захиалга</Link></li>
                <li><Link href="/wishlist" onClick={close}>Хадгалсан бараа</Link></li>
                <li><Link href="/help/delivery" onClick={close}>Хүргэлт, буцаалт</Link></li>
                <li><Link href="/about" onClick={close}>Брэндийн тухай</Link></li>
                <li><Link href="/admin/login" onClick={close}>Удирдлагын самбар (демо)</Link></li>
              </ul>
              <a href={BRAND.portfolioUrl} className="flex items-center gap-1.5 border-t border-stone-200 pt-6 text-sm text-stone-600">
                {BRAND.agencyName} портфолио руу буцах <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
