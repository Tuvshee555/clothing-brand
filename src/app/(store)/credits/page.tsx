import type { Metadata } from 'next'
import creditsJson from '../../../../public/images/credits.json'

export const metadata: Metadata = { title: 'Зургийн эх сурвалж', alternates: { canonical: '/credits' } }

interface Credit {
  key: string
  title: string
  photographer: string
  source: string
  license: string
  licenseUrl: string
}

export default function CreditsPage() {
  const credits = creditsJson as Credit[]
  const unique = [...new Map(credits.map((c) => [c.source, c])).values()]
  const photographers = [...new Set(unique.map((c) => c.photographer).filter(Boolean))].sort()
  return (
    <div className="container-page max-w-4xl pt-10 sm:pt-14">
      <h1 className="display text-[40px] sm:text-[52px]">Зургийн эх сурвалж</h1>
      <div className="prose-store mt-6 max-w-2xl text-[15px] leading-relaxed text-charcoal">
        <p>
          Энэ демо дэлгүүрийн бүх гэрэл зураг Shopify-ийн <strong>Burst</strong> санд байршсан, арилжааны зориулалтаар чөлөөтэй ашиглаж, өөрчилж болох
          лицензтэй зургууд юм (Burst лиценз эсвэл CC0). Бид зургийг тайрч, хэмжээг нь өөрчилж, WebP форматаар шахсан.
        </p>
        <p>Зургууд нь бодит үйлдвэрлэсэн барааг харуулахгүй — бүтээгдэхүүн, брэнд зохиомол.</p>
      </div>
      <p className="mt-8 text-[13.5px]">
        <span className="text-stone-600">Гэрэл зурагчид:</span> {photographers.join(', ')}
      </p>
      <table className="mt-8 w-full border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-stone-300">
            <th className="py-2 pr-3 font-medium">Зураг</th>
            <th className="py-2 pr-3 font-medium">Гэрэл зурагч</th>
            <th className="py-2 font-medium">Лиценз</th>
          </tr>
        </thead>
        <tbody>
          {unique.map((c) => (
            <tr key={c.source} className="border-b border-stone-200 align-top">
              <td className="py-2 pr-3">
                <a href={c.source} className="underline underline-offset-2 hover:text-accent" rel="noopener noreferrer" target="_blank">
                  {c.title}
                </a>
              </td>
              <td className="py-2 pr-3 text-stone-600">{c.photographer || '—'}</td>
              <td className="py-2 text-stone-600">
                <a href={c.licenseUrl} className="underline underline-offset-2" rel="noopener noreferrer" target="_blank">
                  {c.license.startsWith('Creative') ? 'CC0' : 'Burst'}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
