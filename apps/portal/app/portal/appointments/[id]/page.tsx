import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, StatusChip } from '@osteojp/ui'
import { getMyAppointments } from '@/lib/api/client'
import { STATUS_LABELS, STATUS_TONE } from '../status'
import { AppointmentActions } from './AppointmentActions'

function fullDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const appointments = await getMyAppointments()
  const appt = appointments.find((a) => a.id === id)
  if (!appt) notFound()

  const rows = [
    { label: 'Serviço', value: appt.serviceName ?? 'Consulta' },
    { label: 'Data e hora', value: fullDateTime(appt.startsAt), caps: true },
    { label: 'Terapeuta', value: appt.practitionerName ?? '—' },
    { label: 'Clínica', value: appt.locationName ?? '—' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/portal/appointments"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Voltar
      </Link>

      <Card>
        <dl className="flex flex-col gap-4">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-text-secondary">{r.label}</dt>
              <dd className={`text-sm text-text-primary ${r.caps ? 'first-letter:uppercase' : ''}`}>
                {r.value}
              </dd>
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-text-secondary">Estado</dt>
            <dd>
              <StatusChip tone={STATUS_TONE[appt.status]}>{STATUS_LABELS[appt.status]}</StatusChip>
            </dd>
          </div>
        </dl>
      </Card>

      <AppointmentActions id={appt.id} startsAt={appt.startsAt} status={appt.status} />
    </div>
  )
}
