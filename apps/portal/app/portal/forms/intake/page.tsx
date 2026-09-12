import { notFound } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { EmptyState } from '@osteojp/ui'
import { getMyGuestIntakes, type IntakeAnswer } from '@/lib/api/client'
import { s } from '@/lib/i18n'

/**
 * INTAKE-01 - /portal/forms/intake, the patient's OWN clinical intake, READ ONLY.
 *
 * What a patient sent with a guest booking request, once reception converted
 * that request to them. Nothing on this page can change an answer: there is no
 * form, no action and no write endpoint behind it (0087 grants the patient role
 * SELECT only). To correct something, the patient calls the clinic.
 *
 * INERT UNTIL 0087 IS APPLIED: the API answers `enabled: false` and this page is
 * a 404, so no screen, link or string appears before the table exists.
 *
 * VERBATIM, ATTRIBUTED AND DATED, as the therapist's copy on the ficha is: the
 * answers are the patient's words, shown as sent, with the date they were sent.
 * THE THIRD STATE IS WORDS: `nao_perguntado` renders as "Nao perguntado", never
 * as a blank and never as "Nao" (ruling 2). An optional answer left empty renders
 * as "Sem resposta", so an empty line is never mistaken for a missing one.
 */

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Lisbon',
  })
}

/** A calendar date, shown as the calendar date it is: no time zone applies. */
function formatCalendarDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('pt-PT', { timeZone: 'UTC' })
}

function answerWords(a: IntakeAnswer): string {
  switch (a) {
    case 'sim':
      return s.guest.answer_sim
    case 'nao':
      return s.guest.answer_nao
    case 'nao_perguntado':
      return s.guestIntake.answer_not_asked
  }
}

export default async function GuestIntakePage() {
  // A hard fetch failure surfaces forms/error.tsx; an empty list is the empty state.
  const { enabled, intakes } = await getMyGuestIntakes()
  if (!enabled) notFound()

  if (intakes.length === 0) {
    return <EmptyState icon={ClipboardList} title={s.guestIntake.empty} />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{s.guestIntake.title}</h2>
        <p className="text-sm text-text-secondary">{s.guestIntake.intro}</p>
      </div>

      {intakes.map((intake) => {
        const rows: Array<[string, string]> = [
          [s.guest.dob_label, formatCalendarDay(intake.dateOfBirth)],
          [s.guest.reason_label, intake.reason],
          [s.guest.health_conditions_label, intake.healthConditions ?? s.guestIntake.no_answer],
          [s.guest.medication_label, intake.medication ?? s.guestIntake.no_answer],
          [s.guest.falls_accidents_label, intake.fallsAccidents ?? s.guestIntake.no_answer],
          [s.guest.surgeries_label, intake.surgeries ?? s.guestIntake.no_answer],
          [s.guest.pacemaker_label, answerWords(intake.pacemaker)],
          [s.guest.pregnancy_label, answerWords(intake.pregnancy)],
        ]
        return (
          <section
            key={intake.id}
            data-testid="patient-guest-intake"
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          >
            <p className="text-xs text-text-secondary">
              {s.guestIntake.sent_on.replace('{{date}}', formatDateTime(intake.submittedAt))}
            </p>
            <dl className="flex flex-col gap-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-text-secondary">{label}</dt>
                  <dd className="whitespace-pre-wrap text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
