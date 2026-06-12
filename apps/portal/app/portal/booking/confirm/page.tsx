import { ChevronLeft } from 'lucide-react'
import { getBookableCatalog } from '@/lib/api/client'
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
          className="inline-flex min-h-11 items-center gap-1 text-text-secondary hover:text-text-primary text-sm"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Voltar
        </Link>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-5">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex-1 h-1 rounded-full bg-accent-2-700" />
        ))}
      </div>

      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
        Passo 4 de 4
      </p>
      <h2 className="text-lg font-medium text-text-primary mb-5">
        Confirmar marcação
      </h2>

      {/* Summary card */}
      <div className="bg-surface rounded-xl border border-border p-4 mb-6 space-y-3">
        <div>
          <p className="text-xs text-text-muted">Clínica</p>
          <p className="text-sm font-medium text-text-primary">{location.name}</p>
        </div>
        <div className="h-px bg-border" />
        <div>
          <p className="text-xs text-text-muted">Serviço</p>
          <p className="text-sm font-medium text-text-primary">{service.name}</p>
          <p className="text-xs text-text-muted mt-1">{service.durationMin} min</p>
        </div>
        <div className="h-px bg-border" />
        <div>
          <p className="text-xs text-text-muted">Data e hora</p>
          <p className="text-sm font-medium text-text-primary capitalize">{date}</p>
          <p className="text-xs text-text-muted mt-1">{time}</p>
        </div>
      </div>

      <p className="text-xs text-text-secondary text-center mb-5 leading-relaxed">
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
