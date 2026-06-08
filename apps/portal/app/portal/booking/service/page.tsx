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
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ← Voltar
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-5">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className="flex-1 h-1 rounded-full"
            style={{ backgroundColor: s <= 2 ? '#45B9A7' : '#E5E7EB' }}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        Passo 2 de 4
      </p>
      <h1 className="text-lg font-medium text-gray-900 mb-1">
        Escolha o serviço
      </h1>
      <p className="text-sm text-gray-500 mb-5">{location.name}</p>

      <div className="space-y-3">
        {services.map((svc) => (
          <Link
            key={svc.id}
            href={`/portal/booking/slot?location=${locationId}&service=${svc.id}`}
            className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-teal-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{svc.name}</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {svc.durationMin} min
                  {svc.priceCents !== null && (
                    <> · {formatPrice(svc.priceCents, svc.currency)}</>
                  )}
                </p>
              </div>
              <span className="text-gray-300">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
