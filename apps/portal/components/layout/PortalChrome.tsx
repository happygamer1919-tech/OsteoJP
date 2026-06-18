'use client'

import { Calendar, FileText, Home, MapPin, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PortalShell, type AppShellNavItem } from '@osteojp/ui'

/**
 * Portal chrome — wraps every authenticated portal screen in the shared
 * @osteojp/ui PortalShell (W3-01 migration gate, SPEC-portal §1.4).
 *
 * The shell is presentational: this client wrapper supplies the per-screen
 * title and the active-tab state (both derived from the pathname), plus the
 * skip-link and the <main> landmark the shell intentionally does not render.
 *
 * Bottom tabs (SPEC-portal §1.4): Início=Home, Marcações=Calendar,
 * Formulários=FileText, Clínicas=MapPin, Conta=User.
 */

type Tab = AppShellNavItem & { match: string }

const TABS: Tab[] = [
  { href: '/portal/dashboard', label: 'Início', icon: Home, match: '/portal/dashboard' },
  { href: '/portal/appointments', label: 'Marcações', icon: Calendar, match: '/portal/appointments' },
  { href: '/portal/forms', label: 'Formulários', icon: FileText, match: '/portal/forms' },
  { href: '/portal/clinics', label: 'Clínicas', icon: MapPin, match: '/portal/clinics' },
  { href: '/portal/account', label: 'Conta', icon: User, match: '/portal/account' },
]

// Top-bar title per route. Booking is a sub-flow (no tab); documents is reached
// from the dashboard. Falls back to the brand name.
const TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/portal/booking', title: 'Marcar consulta' },
  { prefix: '/portal/dashboard', title: 'Início' },
  { prefix: '/portal/appointments', title: 'Marcações' },
  { prefix: '/portal/forms', title: 'Formulários' },
  { prefix: '/portal/clinics', title: 'Clínicas' },
  { prefix: '/portal/account', title: 'Conta' },
  { prefix: '/portal/documents', title: 'Documentos' },
]

function isActive(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`)
}

export default function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''

  const title = TITLES.find((t) => pathname.startsWith(t.prefix))?.title ?? 'OsteoJP'
  const tabs: AppShellNavItem[] = TABS.map(({ match, ...item }) => ({
    ...item,
    active: isActive(pathname, match),
  }))

  return (
    <>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent-2-700 px-4 py-2 text-sm font-medium text-text-inverse focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        Saltar para o conteúdo
      </a>
      <PortalShell title={title} tabs={tabs} linkComponent={Link} navLabel="Navegação principal">
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </PortalShell>
    </>
  )
}
