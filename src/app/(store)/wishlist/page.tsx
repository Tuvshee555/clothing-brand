import type { Metadata } from 'next'
import { WishlistView } from '@/components/store/wishlist-view'

export const metadata: Metadata = { title: 'Хадгалсан бараа', robots: { index: false } }

export default function WishlistPage() {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <h1 className="display mb-2 text-[40px] sm:text-[52px]">Хадгалсан бараа</h1>
      <p className="mb-10 text-[14px] text-stone-600">Зүрхэн тэмдэгтэй барааг энэ хөтөч дээрээ хадгална. Бүртгэл шаардлагагүй.</p>
      <WishlistView />
    </div>
  )
}
