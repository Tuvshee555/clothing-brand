import { MessageCircle, Phone } from 'lucide-react'
import { buttonClass } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { formatPhone } from '@/lib/phone'

/** Ursgal Digital's business line as a `tel:` link (the people behind this example shop). */
export const AGENCY_TEL = `tel:+976${BRAND.agencyPhone}`

/** "Who runs this shop and how to reach them" — one plain sentence used on every contact surface. */
export const EXAMPLE_SHOP_LINE = `${BRAND.name} бол Ursgal Digital-ын бүтээсэн жишээ дэлгүүр. Messenger, утсаар Ursgal Digital хариулна.`

/** Help card: Messenger to this shop's demo Page (its bot answers) and Ursgal Digital's phone. */
export function ShopHelp({ title = 'Асуулт байна уу?', className }: { title?: string; className?: string }) {
  return (
    <div className={cn('border border-stone-200 bg-white p-5 sm:p-6', className)}>
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
        Messenger-ээр бичвэл дэлгүүрийн туслах шууд хариулж, хэрэгтэй бол ажилтан холбогдоно.
      </p>
      <div className="mt-4 grid gap-2">
        <a href={BRAND.messenger} target="_blank" rel="noopener" className={buttonClass('primary', 'md', 'w-full')}>
          <MessageCircle className="h-4 w-4" strokeWidth={1.6} aria-hidden /> Messenger-ээр бичих
        </a>
        <a href={AGENCY_TEL} className={buttonClass('outline', 'md', 'w-full')}>
          <Phone className="h-4 w-4" strokeWidth={1.6} aria-hidden /> {formatPhone(BRAND.agencyPhone)}
        </a>
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed text-stone-500">{EXAMPLE_SHOP_LINE}</p>
    </div>
  )
}
