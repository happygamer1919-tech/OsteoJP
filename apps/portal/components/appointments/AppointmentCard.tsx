'use client'

import { useState, useTransition } from 'react'
import type { AppointmentView, AppointmentStatus } from '@/lib/api/client'
import { cancelAppointmentAction } from '@/app/portal/appointments/actions'

type Props = {
  appointment: AppointmentView
  showCancel: boolean
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Aguarda confirmação',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
}

// Semantic StatusChip tones (SPEC-foundation §4.5) as token classes.
const STATUS_CHIP: Record<AppointmentStatus, string> = {
  scheduled: 'bg-warning-bg text-warning-700',
  confirmed: 'bg-success-bg text-success-700',
  completed: 'bg-surface-muted text-text-secondary',
  cancelled: 'bg-error-bg text-error',
  no_show: 'bg-error-bg text-error',
}

// Left-edge accent token per status.
const STATUS_ACCENT: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-warning',
  confirmed: 'border-l-accent-2-700',
  completed: 'border-l-border',
  cancelled: 'border-l-border',
  no_show: 'border-l-border',
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-PT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }),
    time: d.toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  }
}

export default function AppointmentCard({ appointment, showCancel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const { date, time } = formatDateTime(appointment.startsAt)
  const chipClass = STATUS_CHIP[appointment.status]
  const accentClass = STATUS_ACCENT[appointment.status]

  function handleCancel() {
    setError(null)
    startTransition(async () => {
      const result = await cancelAppointmentAction(appointment.id)
      if (result?.error) {
        setError(result.error)
        setShowConfirm(false)
      }
    })
  }

  return (
    <div className={`bg-surface rounded-xl border border-border border-l-4 ${accentClass} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-medium text-text-primary">
              {appointment.serviceName ?? 'Consulta'}
            </p>
            <p className="text-sm text-text-secondary mt-0.5">
              {appointment.locationName}
              {appointment.practitionerName && (
                <> · {appointment.practitionerName}</>
              )}
            </p>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ml-2 ${chipClass}`}>
            {STATUS_LABELS[appointment.status]}
          </span>
        </div>

        <p className="text-sm text-text-primary capitalize">
          {date} · {time}
        </p>

        {error && (
          <p role="alert" className="text-error text-xs mt-2">{error}</p>
        )}
      </div>

      {showCancel && appointment.status !== 'cancelled' && (
        <div className="border-t border-border px-4 py-2">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="text-sm text-text-muted hover:text-error transition-colors"
            >
              Cancelar consulta
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-secondary flex-1">Tem a certeza?</p>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-sm text-text-muted"
              >
                Não
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="text-sm font-medium text-error disabled:opacity-50"
              >
                {isPending ? 'A cancelar...' : 'Sim, cancelar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
