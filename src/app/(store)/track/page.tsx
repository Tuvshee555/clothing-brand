import type { Metadata } from 'next'
import Link from 'next/link'
import { ShopHelp } from '@/components/store/shop-contact'
import { TrackOrderForm } from '@/components/store/track-order-form'

export const metadata: Metadata = {
  title: 'Захиалга хянах',
  description: 'Захиалгын дугаар, утасны дугаараараа захиалгынхаа явцыг ямар ч төхөөрөмжөөс харна.',
  alternates: { canonical: '/track' },
}

export default function TrackOrderPage() {
  return (
    <div className="container-page grid gap-10 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="max-w-md">
        <h1 className="display text-[40px] sm:text-[52px]">Захиалга хянах</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-stone-600">
          Захиалгын дугаар болон захиалга өгсөн утасны дугаараа оруулбал ямар ч утас, компьютерээс захиалгынхаа явцыг харж, төлбөрөө хийнэ.
        </p>
        <div className="mt-8">
          <TrackOrderForm />
        </div>
        <p className="mt-6 text-[13px] text-stone-600">
          Энэ хөтчөөр захиалсан бол{' '}
          <Link href="/orders" className="underline underline-offset-2">
            Миний захиалга
          </Link>{' '}
          хэсэгт шууд харагдана.
        </p>
      </div>
      <ShopHelp className="h-fit" title="Дугаараа олохгүй байна уу?" />
    </div>
  )
}
