import Link from 'next/link'

export default function TopBar() {
  return (
    <>
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:text-white focus:text-sm focus:font-medium"
        style={{ backgroundColor: '#45B9A7' }}
      >
        Saltar para o conteúdo
      </a>

      <header
        className="sticky top-0 z-10 bg-white border-b border-gray-100"
        role="banner"
      >
        <div className="flex items-center justify-between px-4 h-14 max-w-md mx-auto">
          <Link
            href="/portal/dashboard"
            aria-label="OsteoJP — Ir para o início"
            className="flex items-center gap-2"
          >
            {/* Teal accent bar matching brand */}
            <span
              className="w-1 h-6 rounded-full"
              style={{ backgroundColor: '#45B9A7' }}
              aria-hidden="true"
            />
            <span className="font-semibold text-gray-900 text-sm tracking-tight">
              OsteoJP
            </span>
          </Link>

          <Link
            href="/portal/clinics"
            aria-label="Contactos das clínicas"
            className="text-xs font-medium px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
          >
            Contactos
          </Link>
        </div>
      </header>
    </>
  )
}
