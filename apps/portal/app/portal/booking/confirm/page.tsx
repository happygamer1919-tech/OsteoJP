import { getBookableCatalog, bookAppointment, ApiError } from '@/lib/api/client'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BookingConfirmForm from '@/components/booking/BookingConfirmForm'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

export default async function BookingConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string
    service?: string
    startsAt?: string
  }>
}) {
  const {
    location: locationId,
    service: serviceId,
    startsAt,
  } = await searchParams
  if (!locationId || !serviceId || !startsAt) redirect('/portal/booking')

  let catalog
  try {
    catalog = await getBookableCatalog()
  } catch {
    redirect('/portal/dashboard')
  }

  const location = catalog.locations.find((l) => l.id === locationId)
  const service = catalog.services.find((s) => s.id === serviceId)
  if (!location || !service) redirect('/portal/booking')

  const { date, time } = formatDateTime(startsAt)

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link
          href={`/portal/booking/slot?location=${locationId}&service=${serviceId}`}
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
            style={{ backgroundColor: '#45B9A7' }}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
        Passo 4 de 4
      </p>
      <h1 className="text-lg font-medium text-gray-900 mb-5">
        Confirmar marcação
      </h1>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 space-y-3">
        <div>
          <p className="text-xs text-gray-400">Clínica</p>
          <p className="text-sm font-medium text-gray-900">{location.name}</p>
        </div>
        <div className="h-px bg-gray-50" />
        <div>
          <p className="text-xs text-gray-400">Serviço</p>
          <p className="text-sm font-medium text-gray-900">{service.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{service.durationMin} min</p>
        </div>
        <div className="h-px bg-gray-50" />
        <div>
          <p className="text-xs text-gray-400">Data e hora</p>
          <p className="text-sm font-medium text-gray-900 capitalize">{date}</p>
          <p className="text-xs text-gray-400 mt-0.5">{time}</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mb-5 leading-relaxed">
        A marcação será confirmada pela receção. Receberá uma notificação quando for confirmada.
      </p>

      <BookingConfirmForm
        serviceId={serviceId}
        locationId={locationId}
        startsAt={startsAt}
      />
    </div>
  )
}
