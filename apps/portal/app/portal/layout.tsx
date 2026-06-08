import type { Metadata } from 'next'
import TopBar from '@/components/layout/TopBar'
import BottomNav from '@/components/layout/BottomNav'

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
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      {/* pb-20 leaves room for the fixed BottomNav */}
      <main
        id="main-content"
        className="max-w-md mx-auto px-4 pt-5 pb-24"
        tabIndex={-1}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
