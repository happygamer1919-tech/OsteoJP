import { createServerClient } from '@/lib/supabase/server'
import { getMyAppointments } from '@/lib/api/client'
import type { AppointmentView } from '@/lib/api/client'
import Link from 'next/link'

function isUpcoming(appt: AppointmentView): boolean {
  return (
    appt.status !== 'cancelled' &&
    appt.status !== 'completed' &&
    appt.status !== 'no_show' &&
    new Date(appt.startsAt) > new Date()
  )
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false }),
  }
}

const STATUS_PT: Record<string, string> = {
  scheduled: 'Aguarda confirmação',
  confirmed: 'Confirmada',
}

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const firstName = (user?.user_metadata?.first_name as string | undefined) ?? 'Paciente'

  let appointments: AppointmentView[] = []
  try {
    appointments = await getMyAppointments()
  } catch {
    // non-fatal — dashboard degrades gracefully
  }

  const upcoming = appointments
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

  const next = upcoming[0] ?? null

  const past = appointments
    .filter((a) => !isUpcoming(a) && a.status !== 'cancelled')
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    .slice(0, 3)

  return (
    <div>
      {/* Greeting */}
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
          style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}
        >
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900">Olá, {firstName}</p>
          <p className="text-xs text-gray-500">Bem-vindo de volta</p>
        </div>
      </div>

      {/* Next appointment */}
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
        Próxima consulta
      </p>

      {next ? (
        <div
          className="bg-white rounded-xl border border-gray-100 p-4 mb-5"
          style={{ borderLeft: '3px solid #45B9A7' }}
        >
          <p className="font-medium text-gray-900">{next.serviceName ?? 'Consulta'}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {(() => { const { date, time } = formatDateTime(next.startsAt); return `${date} · ${time}` })()}
            {next.locationName && ` · ${next.locationName}`}
          </p>
          {next.status in STATUS_PT && (
            <span
              className="inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full"
              style={
                next.status === 'confirmed'
                  ? { backgroundColor: '#EAF3DE', color: '#27500A' }
                  : { backgroundColor: '#FAEEDA', color: '#633806' }
              }
            >
              {STATUS_PT[next.status]}
            </span>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <p className="text-sm text-gray-500">Sem consultas marcadas.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link
          href="/portal/booking"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium text-white"
          style={{ backgroundColor: '#45B9A7' }}
        >
          <span className="text-xl">📅</span>
          Marcar consulta
        </Link>
        <Link
          href="/portal/documents"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium text-gray-700 bg-white border border-gray-100"
        >
          <span className="text-xl">📁</span>
          Documentos
        </Link>
      </div>

      {/* Recent visits */}
      {past.length > 0 && (
        <>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Visitas recentes
          </p>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {past.map((appt) => {
              const { date } = formatDateTime(appt.startsAt)
              return (
                <div key={appt.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {appt.serviceName ?? 'Consulta'}
                    </p>
                    <p className="text-xs text-gray-400">{date}</p>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
                  >
                    Concluída
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
