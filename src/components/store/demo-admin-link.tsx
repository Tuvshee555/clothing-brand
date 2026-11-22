'use client'

import { ArrowUpRight } from 'lucide-react'
import { useState, useTransition } from 'react'
import { buttonClass } from '@/components/ui/button'
import { enterDemoAction } from '@/server/actions/auth'

/** Opens the public demo admin (restricted, scoped to this browser) at `next`. */
export function DemoAdminButton({ next, label = 'Удирдлагын самбарт харах (демо)', variant = 'outline' }: { next: string; label?: string; variant?: 'outline' | 'primary' }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      <button
        type="button"
        // max-w-full + a wrapping label: on a phone the long label takes two lines instead of widening the page.
        className={buttonClass(variant, 'md', 'max-w-full')}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await enterDemoAction(next)
            if (res && !res.ok) setError(res.error)
          })
        }
      >
        <span className="whitespace-normal text-center leading-tight">{pending ? 'Нээж байна…' : label}</span> <ArrowUpRight className="h-4 w-4 shrink-0" />
      </button>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  )
}
