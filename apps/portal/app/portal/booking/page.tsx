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
            style={{ backgroundColor: s === 1 ? '#45B9A7' : '#E5E7EB' }}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        Passo 1 de 4
      </p>
      <h1 className="text-lg font-medium text-gray-900 mb-5">
        Escolha a clínica
      </h1>

      <div className="space-y-3">
        {catalog.locations.map((loc) => (
          <Link
            key={loc.id}
            href={`/portal/booking/service?location=${loc.id}`}
            className="block bg-white rounded-xl border border-gray-100 p-4 hover:border-teal-300 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span style={{ color: '#45B9A7' }}>📍</span>
              <div>
                <p className="font-medium text-gray-900">{loc.name}</p>
              </div>
              <span className="ml-auto text-gray-300">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
