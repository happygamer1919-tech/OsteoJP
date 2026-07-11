import { ClipboardList } from 'lucide-react'
import { EmptyState, StatusChip, type StatusTone } from '@osteojp/ui'
import { getMyForms } from '@/lib/api/client'
import { s } from '@/lib/i18n'

const THERAPY_LABELS: Record<string, string> = {
  osteopathy: s.intake.fichaGeral.title,
  physiotherapy: s.forms.fisioterapia_title,
  rpg: 'RPG',
  nesa: s.forms.nesa_title,
  'massagem-terapeutica': s.services.massagem,
  'pilates-terapeutico': s.services.pilates,
}

function formTitle(formKey: string, therapy: string | null): string {
  if (formKey === 'ficha_geral') return s.forms.general_anamnese_title
  if (therapy && THERAPY_LABELS[therapy]) return `${s.forms.form_word} ${THERAPY_LABELS[therapy]}`
  return s.forms.title
}

// Status reflects the review state honestly — a submitted ficha is never shown as
// "concluído" (SPEC-portal §10.3); it is always "for review" until a therapist acts.
const REVIEW: Record<string, { label: string; tone: StatusTone }> = {
  pending_review: { label: s.forms.status_under_review, tone: 'info' },
  in_review: { label: s.forms.status_under_review, tone: 'info' },
  approved: { label: s.forms.status_completed, tone: 'success' },
  rejected: { label: s.forms.status_pending, tone: 'warning' },
}

function review(state: string): { label: string; tone: StatusTone } {
  return REVIEW[state] ?? { label: s.forms.status_under_review, tone: 'info' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Lisbon' })
}

export default async function FormsPage() {
  // A hard fetch failure surfaces error.tsx; an empty list is the empty state.
  const submissions = await getMyForms()

  return (
    <div className="flex flex-col gap-4">
      {submissions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={s.forms.empty}
          description={s.forms.empty}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((sub) => {
            const r = review(sub.reviewState)
            return (
              <div
                key={sub.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {formTitle(sub.formKey, sub.therapy)}
                  </p>
                  <p className="text-xs text-text-secondary">{formatDate(sub.submittedAt)}</p>
                </div>
                <StatusChip tone={r.tone} className="shrink-0">
                  {r.label}
                </StatusChip>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-text-secondary">
        {s.forms.forms_info}
      </p>
    </div>
  )
}
