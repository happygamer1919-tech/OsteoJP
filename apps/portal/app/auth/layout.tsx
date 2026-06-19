import { BrandLockup, ToastProvider } from '@osteojp/ui'
import { s } from '@/lib/i18n'

// Auth frame (SPEC-portal §3/§4): a centered single column with the full brand
// lockup above the screen card. Wrapped in ToastProvider so the activate flow
// can confirm success with a toast.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ToastProvider regionLabel={s.common.toast_region}>
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
        <div className="w-full max-w-sm">
          <header className="mb-12 flex justify-center">
            <BrandLockup variant="full" size="lg" />
          </header>
          <main>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
