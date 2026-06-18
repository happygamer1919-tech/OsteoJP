import { Calendar, FileText, MapPin, Plus } from 'lucide-react'
import { Card, EmptyState } from '@osteojp/ui'
import type { LucideIcon } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { getMyAppointments } from '@/lib/api/client'
import type { AppointmentView } from '@/lib/api/client'
import { NavButton } from './NavButton'

function isUpcoming(appt: AppointmentView): boolean {
  return (
    appt.status !== 'cancelled' &&
    appt.status !== 'completed' &&
    appt.status !== 'no_show' &&
    new Date(appt.startsAt) > new Date()
  )
}

function heroDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })
}

type QuickAction = { href: string; label: string; icon: LucideIcon }

const QUICK_ACTIONS: QuickAction[] = [
  { href: '/portal/booking', label: 'Marcar consulta', icon: Plus },
  { href: '/portal/appointments', label: 'As minhas marcações', icon: Calendar },
  { href: '/portal/documents', label: 'Documentos', icon: FileText },
  { href: '/portal/clinics', label: 'Clínicas', icon: MapPin },
]

export default async function DashboardPage() {
  const supabase = await createServerClient()

  let firstName = ''
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    firstName = (session?.user?.user_metadata?.first_name as string | undefined) ?? ''
  } catch {
    // non-fatal — firstName stays empty, page renders without personalisation
  }

  let appointments: AppointmentView[] = []
  try {
    appointments = await getMyAppointments()
  } catch {
    // non-fatal — show empty state rather than error boundary
  }

  const upcoming = appointments
    .filter(isUpcoming)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  const next = upcoming[0] ?? null

  const past = appointments
    .filter((a) => !isUpcoming(a) && a.status !== 'cancelled')
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime())
    .slice(0, 3)

  const today = new Date().toLocaleDateString('pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Pending-forms banner (SPEC §5.3) is omitted: the portal API exposes no
  // pending-forms data yet (SPEC §0.1 — omit missing-data elements).

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <h3 className="text-xl text-text-primary">{firstName ? `Olá, ${firstName}` : 'Olá'}</h3>
        <p className="text-sm text-text-secondary first-letter:uppercase">{today}</p>
      </div>

      {/* Hero: next appointment, or empty state */}
      {next ? (
        <Card
          className="border-l-4 border-l-accent-2-700"
          footer={
            <div className="flex gap-3">
              <NavButton href="/portal/appointments" variant="secondary" className="min-h-11 flex-1">
                Remarcar
              </NavButton>
              <NavButton href="/portal/appointments" variant="ghost" className="min-h-11 flex-1">
                Detalhes
              </NavButton>
            </div>
          }
        >
          <p className="text-xs font-medium text-text-secondary">Próxima consulta</p>
          <h3 className="mt-1 text-xl text-text-primary first-letter:uppercase">
            {heroDateTime(next.startsAt)}
          </h3>
          <p className="mt-1 text-sm text-text-primary">
            {next.serviceName ?? 'Consulta'}
            {next.practitionerName ? ` · ${next.practitionerName}` : ''}
          </p>
          {next.locationName && (
            <p className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
              <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
              {next.locationName}
            </p>
          )}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Calendar}
            title="Sem consultas marcadas"
            description="Quando marcar uma consulta, aparecerá aqui."
            action={
              <NavButton href="/portal/booking" variant="primary" className="min-h-11">
                <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                Marcar consulta
              </NavButton>
            }
          />
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
          <Card key={href} href={href} className="p-4">
            <span className="flex flex-col items-center gap-2 text-center">
              <Icon size={24} strokeWidth={1.75} aria-hidden="true" className="text-accent-2-700" />
              <span className="text-sm font-medium text-text-primary">{label}</span>
            </span>
          </Card>
        ))}
      </div>

      {/* Recent activity (only when it exists) */}
      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-text-secondary">Visitas recentes</h3>
          <div className="divide-y divide-border rounded-lg border border-border bg-surface">
            {past.map((appt) => (
              <div key={appt.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {appt.serviceName ?? 'Consulta'}
                  </p>
                  <p className="text-xs text-text-secondary first-letter:uppercase">
                    {shortDate(appt.startsAt)}
                  </p>
                </div>
                <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium text-text-secondary">
                  Concluída
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
