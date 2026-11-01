// The fictional brand's identity in one place. Rename the label here and the
// storefront, metadata, e-mails and admin follow. Store details that owners edit
// day to day (announcement, contact text, policies) live in the database
// `settings` table instead and are managed from /admin/settings.

export const BRAND = {
  /** Wordmark. Latin so it works as a domain and social handle. */
  name: 'MANAN',
  /** How the name is written in Mongolian Cyrillic (манан — "mist"). */
  nameMn: 'Манан',
  tagline: 'Өөрийн хэв маягийг бүтээ.',
  /** One-line positioning used in metadata. */
  description:
    'MANAN — Улаанбаатарын хотын хэмнэлд зориулсан, чимээгүй тансаг өдөр тутмын хувцасны зохиомол брэнд. Ursgal Digital-ын портфолио демо.',
  /** `.example` is a reserved domain (RFC 2606), so this can never reach a real inbox. */
  email: 'hello@manan.example',
  /** Where the "back to portfolio" link points. */
  portfolioUrl: process.env.NEXT_PUBLIC_PORTFOLIO_URL ?? 'https://ursgal-digital.vercel.app/portfolio/fashion',
  agencyName: 'Ursgal Digital',
} as const

/** Shown wherever a visitor could mistake the demo for a real shop. */
export const DEMO_NOTICE =
  'Энэ бол Ursgal Digital-ын портфолио демо. Брэнд, бүтээгдэхүүн, үнэ, үлдэгдэл бүгд зохиомол бөгөөд бодит худалдан авалт, төлбөр хийгдэхгүй.'
