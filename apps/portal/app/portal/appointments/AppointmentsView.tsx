'use client'

import { Calendar, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { EmptyState, SegmentedControl, StatusChip } from '@osteojp/ui'
import type { AppointmentView } from '@/lib/api/client'
import { NavButton } from '../dashboard/NavButton'
import { STATUS_LABELS, STATUS_TONE } from './status'

function dateParts(iso: string) {
  const d = new Date(iso)
  return {
    month: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', ''),
    day: d.toLocaleDateString('pt-PT', { day: 'numeric' }),
    time: d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

function AppointmentRow({ appt, muted }: { appt: AppointmentView; muted?: boolean }) {
  const { month, day, time } = dateParts(appt.startsAt)
  // SPEC-foundation §4.5 / §6.3: a cancelled appointment strikes through the row
  // (not the chip).
  const cancelled = appt.status === 'cancelled'
  return (
    <Link
      href={`/portal/appointments/${appt.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors duration-fast ease-standard hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      <div className={`flex w-12 shrink-0 flex-col items-center ${muted ? 'text-text-secondary' : 'text-text-primary'}`}>
        <span className="text-xs font-medium text-text-secondary first-letter:uppercase">{month}</span>
        <span className="text-xl">{day}</span>
      </div>
      <div className={`min-w-0 flex-1 ${cancelled ? 'line-through' : ''}`}>
        <p className="truncate text-sm font-medium text-text-primary">
          {time} · {appt.serviceName ?? 'Consulta'}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {[appt.practitionerName, appt.locationName].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <StatusChip tone={STATUS_TONE[appt.status]}>{STATUS_LABELS[appt.status]}</StatusChip>
      <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-text-secondary" />
    </Link>
  )
}

export function AppointmentsView({
  upcoming,
  past,
}: {
  upcoming: AppointmentView[]
  past: AppointmentView[]
}) {
  const [segment, setSegment] = useState<'proximas' | 'historico'>('proximas')
  const list = segment === 'proximas' ? upcoming : past

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        aria-label="Filtrar marcações"
        value={segment}
        onValueChange={(v) => setSegment(v as 'proximas' | 'historico')}
        items={[
          { value: 'proximas', label: 'Próximas' },
          { value: 'historico', label: 'Histórico' },
        ]}
        className="w-full"
      />

      {list.length === 0 ? (
        segment === 'proximas' ? (
          <EmptyState
            icon={Calendar}
            title="Sem consultas marcadas"
            description="Marque a sua próxima consulta quando quiser."
            action={
              <NavButton href="/portal/booking" variant="primary" className="min-h-11">
                Marcar consulta
              </NavButton>
            }
          />
        ) : (
          <EmptyState
            icon={Calendar}
            title="Sem histórico"
            description="As consultas anteriores aparecerão aqui."
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((appt) => (
            <AppointmentRow key={appt.id} appt={appt} muted={segment === 'historico'} />
          ))}
        </div>
      )}
    </div>
  )
}
