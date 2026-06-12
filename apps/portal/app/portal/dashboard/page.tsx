import { Calendar, FileText } from 'lucide-react'
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
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 bg-accent-2-100 text-accent-2-800">
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-text-primary">Olá, {firstName}</p>
          <p className="text-xs text-text-secondary">Bem-vindo de volta</p>
        </div>
      </div>

      {/* Next appointment */}
      <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
        Próxima consulta
      </p>

      {next ? (
        <div className="bg-surface rounded-xl border border-border border-l-4 border-l-accent-2-700 p-4 mb-5">
          <p className="font-medium text-text-primary">{next.serviceName ?? 'Consulta'}</p>
          <p className="text-sm text-text-secondary mt-0.5">
            {(() => { const { date, time } = formatDateTime(next.startsAt); return `${date} · ${time}` })()}
            {next.locationName && ` · ${next.locationName}`}
          </p>
          {next.status in STATUS_PT && (
            <span
              className={`inline-block mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
                next.status === 'confirmed'
                  ? 'bg-success-bg text-success-700'
                  : 'bg-warning-bg text-warning-700'
              }`}
            >
              {STATUS_PT[next.status]}
            </span>
          )}
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border p-4 mb-5">
          <p className="text-sm text-text-secondary">Sem consultas marcadas.</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Link
          href="/portal/booking"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium bg-accent-2-700 text-text-inverse"
        >
          <Calendar size={24} strokeWidth={1.75} aria-hidden="true" />
          Marcar consulta
        </Link>
        <Link
          href="/portal/documents"
          className="flex flex-col items-center justify-center gap-2 rounded-xl py-4 text-sm font-medium text-text-primary bg-surface border border-border"
        >
          <FileText size={24} strokeWidth={1.75} aria-hidden="true" />
          Documentos
        </Link>
      </div>

      {/* Recent visits */}
      {past.length > 0 && (
        <>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Visitas recentes
          </p>
          <div className="bg-surface rounded-xl border border-border divide-y divide-border">
            {past.map((appt) => {
              const { date } = formatDateTime(appt.startsAt)
              return (
                <div key={appt.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {appt.serviceName ?? 'Consulta'}
                    </p>
                    <p className="text-xs text-text-muted">{date}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-muted text-text-secondary">
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
