import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CheckoutForm } from '@/components/store/checkout-form'
import { buttonClass } from '@/components/ui/button'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { db } from '@/server/db'
import { getStoreContent } from '@/server/queries/settings'
import { getCartView } from '@/server/services/cart'
import { readVisitorKey } from '@/server/visitor'

export const metadata: Metadata = { title: 'Захиалах', robots: { index: false } }

async function CheckoutBody() {
  const [cart, content] = await Promise.all([getCartView(db, await readVisitorKey()), getStoreContent()])
  if (cart.lines.length === 0) {
    return (
      <EmptyState title="Сагс хоосон байна" action={<Link href="/shop" className={buttonClass('primary')}>Дэлгүүр үзэх</Link>}>
        Захиалахын тулд эхлээд бараагаа сагсанд нэмнэ үү.
      </EmptyState>
    )
  }
  if (cart.hasProblems) {
    return (
      <Alert tone="warning" title="Сагсаа шалгана уу">
        Зарим барааны үлдэгдэл өөрчлөгдсөн байна.{' '}
        <Link href="/cart" className="underline underline-offset-2">
          Сагс руу буцаж
        </Link>{' '}
        тоо ширхэгээ засна уу.
      </Alert>
    )
  }
  return <CheckoutForm lines={cart.lines} subtotal={cart.subtotal} shipping={content.shipping} />
}

export default function CheckoutPage() {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <h1 className="display mb-8 text-[40px] sm:text-[52px]">Захиалах</h1>
      <Suspense fallback={<div className="h-96 animate-pulse bg-paper-2" />}>
        <CheckoutBody />
      </Suspense>
    </div>
  )
}
