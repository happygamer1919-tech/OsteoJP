'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/portal/dashboard',     label: 'Início',    icon: '⊞' },
  { href: '/portal/appointments',  label: 'Consultas', icon: '📅' },
  { href: '/portal/forms',         label: 'Fichas',    icon: '📋' },
  { href: '/portal/documents',     label: 'Docs',      icon: '📁' },
  { href: '/portal/account',       label: 'Conta',     icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-50">
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors"
            style={{ color: active ? '#45B9A7' : '#9CA3AF' }}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className={active ? 'font-medium' : ''}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
