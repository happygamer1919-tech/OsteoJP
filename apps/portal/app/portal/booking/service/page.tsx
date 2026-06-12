import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getBookableCatalog } from '@/lib/api/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'

function formatPrice(priceCents: number | null, currency: string): string {
  if (priceCents === null) return ''
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(priceCents / 100)
}

export default async function BookingServicePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>
}) {
  const { location: locationId } = await searchParams
  if (!locationId) redirect('/portal/booking')

  let catalog
  try {
    catalog = await getBookableCatalog()
  } catch {
    redirect('/portal/dashboard')
  }

  const location = catalog.locations.find((l) => l.id === locationId)
  if (!location) redirect('/portal/booking')

  // Filter services available at this location
  const services = catalog.services.filter(
    (s) => s.locationIds.length === 0 || s.locationIds.includes(locationId),
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/portal/booking"
          className="inline-flex items-center gap-1 text-text-muted hover:text-text-secondary text-sm"
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
            className={`flex-1 h-1 rounded-full ${s <= 2 ? 'bg-accent-2-700' : 'bg-neutral-200'}`}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        Passo 2 de 4
      </p>
      <h2 className="text-lg font-medium text-text-primary mb-1">
        Escolha o serviço
      </h2>
      <p className="text-sm text-text-secondary mb-5">{location.name}</p>

      <div className="space-y-3">
        {services.map((svc) => (
          <Link
            key={svc.id}
            href={`/portal/booking/slot?location=${locationId}&service=${svc.id}`}
            className="block bg-surface rounded-xl border border-border p-4 hover:border-accent-2-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">{svc.name}</p>
                <p className="text-sm text-text-muted mt-0.5">
                  {svc.durationMin} min
                  {svc.priceCents !== null && (
                    <> · {formatPrice(svc.priceCents, svc.currency)}</>
                  )}
                </p>
              </div>
              <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="text-text-muted" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
