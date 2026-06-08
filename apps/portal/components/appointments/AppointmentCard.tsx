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

const STATUS_COLORS: Record<AppointmentStatus, { bg: string; color: string }> = {
  scheduled: { bg: '#FAEEDA', color: '#633806' },
  confirmed: { bg: '#EAF3DE', color: '#27500A' },
  completed: { bg: '#F3F4F6', color: '#6B7280' },
  cancelled: { bg: '#FCEBEB', color: '#791F1F' },
  no_show: { bg: '#FCEBEB', color: '#791F1F' },
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
  const statusStyle = STATUS_COLORS[appointment.status]
  const accentColor =
    appointment.status === 'confirmed'
      ? '#45B9A7'
      : appointment.status === 'scheduled'
      ? '#EF9F27'
      : '#E5E7EB'

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
    <div
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="font-medium text-gray-900">
              {appointment.serviceName ?? 'Consulta'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {appointment.locationName}
              {appointment.practitionerName && (
                <> · {appointment.practitionerName}</>
              )}
            </p>
          </div>
          <span
            className="text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ml-2"
            style={statusStyle}
          >
            {STATUS_LABELS[appointment.status]}
          </span>
        </div>

        <p className="text-sm text-gray-700 capitalize">
          {date} · {time}
        </p>

        {error && (
          <p className="text-red-600 text-xs mt-2">{error}</p>
        )}
      </div>

      {showCancel && appointment.status !== 'cancelled' && (
        <div className="border-t border-gray-50 px-4 py-2">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="text-sm text-gray-400 hover:text-red-500 transition-colors"
            >
              Cancelar consulta
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600 flex-1">Tem a certeza?</p>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-sm text-gray-400"
              >
                Não
              </button>
              <button
                onClick={handleCancel}
                disabled={isPending}
                className="text-sm font-medium text-red-600 disabled:opacity-50"
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
