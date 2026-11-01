'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Button, buttonClass } from '@/components/ui/button'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div>
        <h1 className="display text-[40px]">Алдаа гарлаа</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-stone-600">Түр саатал гарсан байж магадгүй. Дахин оролдоно уу.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Дахин оролдох</Button>
          <Link href="/" className={buttonClass('outline')}>
            Нүүр хуудас
          </Link>
        </div>
      </div>
    </div>
  )
}
