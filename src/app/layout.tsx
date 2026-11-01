import type { Metadata, Viewport } from 'next'
import { Jost, Noto_Serif_Display } from 'next/font/google'
import { BRAND } from '@/lib/brand'
import { appUrl, indexingAllowed } from '@/server/app-url'
import './globals.css'

const jost = Jost({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-jost',
  display: 'swap',
})

const serifDisplay = Noto_Serif_Display({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-serif-display',
  style: ['normal', 'italic'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: { type: 'website', locale: 'mn_MN', siteName: BRAND.name },
  formatDetection: { telephone: false },
  // A portfolio demo is not a real shop: keep it out of search results unless explicitly enabled.
  robots: indexingAllowed() ? { index: true, follow: true } : { index: false, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#f7f4ef',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className={`${jost.variable} ${serifDisplay.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
