import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { getBookableCatalog } from '@/lib/api/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function BookingPage() {
  let catalog
  try {
    catalog = await getBookableCatalog()
  } catch {
    redirect('/portal/dashboard')
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/portal/dashboard"
          className="inline-flex min-h-11 items-center gap-1 text-text-secondary hover:text-text-primary text-sm"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Voltar
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-5">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-full ${s === 1 ? 'bg-accent-2-700' : 'bg-neutral-200'}`}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1">
        Passo 1 de 4
      </p>
      <h2 className="text-lg font-medium text-text-primary mb-5">
        Escolha a clínica
      </h2>

      <div className="space-y-3">
        {catalog.locations.map((loc) => (
          <Link
            key={loc.id}
            href={`/portal/booking/service?location=${loc.id}`}
            className="block bg-surface rounded-xl border border-border p-4 hover:border-accent-2-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MapPin size={20} strokeWidth={1.75} aria-hidden="true" className="text-accent-2-700" />
              <div>
                <p className="font-medium text-text-primary">{loc.name}</p>
              </div>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="ml-auto text-text-secondary" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
