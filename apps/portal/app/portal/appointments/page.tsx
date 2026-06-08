import { getMyAppointments } from '@/lib/api/client'
import type { AppointmentView } from '@/lib/api/client'
import Link from 'next/link'
import AppointmentCard from '@/components/appointments/AppointmentCard'

function isUpcoming(appt: AppointmentView): boolean {
  return (
    appt.status !== 'cancelled' &&
    appt.status !== 'completed' &&
    appt.status !== 'no_show' &&
    new Date(appt.startsAt) > new Date()
  )
}

export default async function AppointmentsPage() {
  let appointments: AppointmentView[] = []
  let fetchError = false

  try {
    appointments = await getMyAppointments()
  } catch {
    fetchError = true
  }

  const upcoming = appointments.filter(isUpcoming)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const past = appointments.filter((a) => !isUpcoming(a))
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())

  if (fetchError) {
    return (
      <div>
        <h1 className="text-lg font-medium text-gray-900 mb-4">As minhas consultas</h1>
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
          Não foi possível carregar as consultas. Tente novamente.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium text-gray-900">As minhas consultas</h1>
        <Link
          href="/portal/booking"
          className="text-sm font-medium px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}
        >
          + Marcar
        </Link>
      </div>

      {/* Upcoming */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
        Próximas
      </p>

      {upcoming.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center mb-6">
          <p className="text-gray-500 text-sm mb-3">Não tem consultas marcadas.</p>
          <Link
            href="/portal/booking"
            className="text-sm font-medium"
            style={{ color: '#45B9A7' }}
          >
            Marcar consulta →
          </Link>
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {upcoming.map((appt) => (
            <AppointmentCard key={appt.id} appointment={appt} showCancel />
          ))}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
            Anteriores
          </p>
          <div className="space-y-3">
            {past.map((appt) => (
              <AppointmentCard key={appt.id} appointment={appt} showCancel={false} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
