'use client'

import { Heart } from 'lucide-react'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { cn } from '@/lib/cn'

// The wishlist lives in the visitor's own browser (no account needed). The
// product data shown for it is always loaded from the database.
const KEY = 'manan.wishlist'
const EVENT = 'manan:wishlist'

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EVENT, onChange)
  }
}

function snapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function parse(raw: string): string[] {
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 40) : []
  } catch {
    return []
  }
}

export function useWishlist() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]')
  const items = useMemo(() => parse(raw), [raw])
  const toggle = useCallback((slug: string) => {
    const current = parse(snapshot())
    const next = current.includes(slug) ? current.filter((s) => s !== slug) : [slug, ...current].slice(0, 40)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage can be unavailable (private mode); the button simply won't persist.
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return { items, has: (slug: string) => items.includes(slug), toggle }
}

export function WishlistButton({ slug, name, className }: { slug: string; name: string; className?: string }) {
  const { has, toggle } = useWishlist()
  const saved = has(slug)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(slug)
      }}
      aria-pressed={saved}
      aria-label={saved ? `${name} — хадгалснаас хасах` : `${name} — хадгалах`}
      className={cn('grid h-9 w-9 place-items-center bg-paper/85 text-ink backdrop-blur-sm transition hover:bg-white', className)}
    >
      <Heart className={cn('h-[17px] w-[17px]', saved && 'fill-ink')} strokeWidth={1.5} />
    </button>
  )
}

export function WishlistCount() {
  const { items } = useWishlist()
  if (items.length === 0) return null
  return (
    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center bg-ink px-1 text-[10px] font-medium text-white">
      {items.length}
    </span>
  )
}
