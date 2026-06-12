import type { Metadata } from 'next'
import PortalChrome from '@/components/layout/PortalChrome'

export const metadata: Metadata = {
  title: {
    template: '%s · OsteoJP',
    default: 'OsteoJP',
  },
  description: 'O seu portal de saúde OsteoJP — marcações, fichas e documentos.',
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Shared @osteojp/ui PortalShell (top bar + bottom tabs) supplies the chrome;
  // PortalChrome wires the per-screen title, active tab, skip-link and <main>.
  return <PortalChrome>{children}</PortalChrome>
}
