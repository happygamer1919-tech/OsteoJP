import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, StatusChip } from '@osteojp/ui'
import { getMyAppointments } from '@/lib/api/client'
import { STATUS_LABELS, STATUS_TONE } from '../status'
import { AppointmentActions } from './AppointmentActions'
import { locationDisplayName } from '@/lib/locationLabel'
import { s } from '@/lib/i18n'

function fullDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  })
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Lisbon' })
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
    { label: s.appointments.detail_service, value: appt.serviceName ?? s.appointments.detail_service },
    { label: s.appointments.detail_datetime, value: fullDateTime(appt.startsAt), caps: true },
    { label: s.appointments.detail_therapist, value: appt.practitionerName ?? '—' },
    { label: s.appointments.detail_location, value: locationDisplayName(appt.locationName) ?? '—' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal/appointments"
        aria-label={s.appointments.title}
        className="inline-flex min-h-11 items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        {s.common.back}
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
            <dt className="text-xs font-medium text-text-secondary">{s.appointments.detail_status}</dt>
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
