'use client'

import { Boxes, LayoutDashboard, Layers, Menu, Package, Settings, ShoppingBag, Users, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/cn'

export const ADMIN_NAV = [
  { href: '/admin', label: 'Хянах самбар', icon: LayoutDashboard },
  { href: '/admin/orders', label: 'Захиалга', icon: ShoppingBag },
  { href: '/admin/products', label: 'Бүтээгдэхүүн', icon: Package },
  { href: '/admin/inventory', label: 'Үлдэгдэл', icon: Boxes },
  { href: '/admin/customers', label: 'Харилцагч', icon: Users },
  { href: '/admin/collections', label: 'Ангилал, цуглуулга', icon: Layers },
  { href: '/admin/settings', label: 'Тохиргоо', icon: Settings },
] as const

function NavLinks({ onNavigate, badges }: { onNavigate?: () => void; badges: Record<string, number> }) {
  const pathname = usePathname()
  return (
    <ul className="space-y-0.5">
      {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition', active ? 'bg-ink text-white' : 'text-charcoal hover:bg-paper-2')}
            >
              <Icon className="h-4 w-4" strokeWidth={1.7} />
              <span className="flex-1">{label}</span>
              {!!badges[href] && (
                <span className={cn('tabular rounded-full px-1.5 text-[11px]', active ? 'bg-white/20' : 'bg-warning-soft text-warning')}>{badges[href]}</span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function AdminSidebar({ badges }: { badges: Record<string, number> }) {
  return (
    <nav aria-label="Удирдлагын цэс" className="px-3">
      <NavLinks badges={badges} />
    </nav>
  )
}

export function AdminMobileNav({ badges, footer }: { badges: Record<string, number>; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-paper-2 lg:hidden" aria-label="Цэс нээх">
        <Menu className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Удирдлагын цэс">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="wordmark text-sm">MANAN</span>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-paper-2" aria-label="Хаах">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks badges={badges} onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-stone-200 pt-3">{footer}</div>
          </div>
        </div>
      )}
    </>
  )
}
