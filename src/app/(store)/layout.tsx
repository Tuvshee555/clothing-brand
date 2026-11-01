import { Suspense } from 'react'
import { AssistantWidget } from '@/components/store/assistant-widget'
import { CartProvider } from '@/components/store/cart-drawer'
import { Footer } from '@/components/store/footer'
import { AnnouncementBar, Header } from '@/components/store/header'
import { getStoreContent } from '@/server/queries/settings'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const content = await getStoreContent()
  const freeThreshold = content.shipping.find((s) => s.region === 'ub' && s.freeThreshold !== null)?.freeThreshold ?? null
  return (
    <CartProvider freeShippingThreshold={freeThreshold}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Үндсэн агуулга руу шилжих
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main">{children}</main>
      <Footer />
      {/* Reads the current URL (to know which product is open), so it streams in. */}
      <Suspense fallback={null}>
        <AssistantWidget storeName={content.info.storeName} />
      </Suspense>
    </CartProvider>
  )
}
