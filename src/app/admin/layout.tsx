import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Удирдлагын самбар', template: '%s · Удирдлага' },
  robots: { index: false, follow: false },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[#f4f3f0] text-ink">{children}</div>
}
