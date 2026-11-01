import Link from 'next/link'
import { buttonClass } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div>
        <p className="wordmark text-lg">{BRAND.name}</p>
        <h1 className="display mt-10 text-[44px]">Хуудас олдсонгүй</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] text-stone-600">Хайсан хуудас устсан эсвэл хаяг буруу байна.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className={buttonClass('primary')}>
            Нүүр хуудас
          </Link>
          <Link href="/shop" className={buttonClass('outline')}>
            Дэлгүүр
          </Link>
        </div>
      </div>
    </div>
  )
}
