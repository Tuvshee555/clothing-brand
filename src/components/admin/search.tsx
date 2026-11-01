'use client'

import { Search } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/cn'

/** Search box that writes ?q= to the URL (the page filters on the server). */
export function AdminSearch({ placeholder, param = 'q' }: { placeholder: string; param?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get(param) ?? '')
  const [pending, start] = useTransition()
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        const next = new URLSearchParams(params.toString())
        if (value.trim()) next.set(param, value.trim())
        else next.delete(param)
        next.delete('page')
        start(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ''}`))
      }}
      className={cn('flex h-10 w-full max-w-xs items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 focus-within:border-ink', pending && 'opacity-60')}
    >
      <Search className="h-4 w-4 text-stone-500" />
      <label className="sr-only" htmlFor={`admin-search-${param}`}>
        Хайх
      </label>
      <input
        id={`admin-search-${param}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-full flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-stone-500"
        maxLength={60}
      />
    </form>
  )
}
