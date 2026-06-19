'use client'

import { Calendar, FileText, Home, MapPin, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PortalShell, type AppShellNavItem } from '@osteojp/ui'
import { s } from '@/lib/i18n'

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
  { href: '/portal/dashboard', label: s.nav.home, icon: Home, match: '/portal/dashboard' },
  { href: '/portal/appointments', label: s.nav.appointments, icon: Calendar, match: '/portal/appointments' },
  { href: '/portal/forms', label: s.nav.forms, icon: FileText, match: '/portal/forms' },
  { href: '/portal/clinics', label: s.nav.clinics, icon: MapPin, match: '/portal/clinics' },
  { href: '/portal/account', label: s.nav.account, icon: User, match: '/portal/account' },
]

// Top-bar title per route. Booking is a sub-flow (no tab); documents is reached
// from the dashboard. Falls back to the brand name.
const TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/portal/booking', title: s.booking.title },
  { prefix: '/portal/dashboard', title: s.nav.home },
  { prefix: '/portal/appointments', title: s.nav.appointments },
  { prefix: '/portal/forms', title: s.nav.forms },
  { prefix: '/portal/clinics', title: s.nav.clinics },
  { prefix: '/portal/account', title: s.nav.account },
  { prefix: '/portal/documents', title: s.nav.documents },
]

function isActive(pathname: string, match: string): boolean {
  return pathname === match || pathname.startsWith(`${match}/`)
}

export default function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''

  const title = TITLES.find((t) => pathname.startsWith(t.prefix))?.title ?? s.common.app_name
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
        {s.common.skip_to_content}
      </a>
      <PortalShell title={title} tabs={tabs} linkComponent={Link} navLabel={s.nav.home}>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </PortalShell>
    </>
  )
}
