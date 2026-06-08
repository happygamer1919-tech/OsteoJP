'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/portal/dashboard', label: 'Início', icon: '🏠' },
  { href: '/portal/appointments', label: 'Consultas', icon: '📅' },
  { href: '/portal/forms', label: 'Fichas', icon: '📋' },
  { href: '/portal/clinics', label: 'Clínicas', icon: '📍' },
  { href: '/portal/account', label: 'Conta', icon: '👤' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-10"
      aria-label="Navegação principal"
    >
      <ul className="flex max-w-md mx-auto" role="list">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors"
                style={{ color: isActive ? '#45B9A7' : '#9CA3AF' }}
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
