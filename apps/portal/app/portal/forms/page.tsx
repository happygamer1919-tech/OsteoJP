import { ClipboardList } from 'lucide-react'
import { EmptyState, StatusChip, type StatusTone } from '@osteojp/ui'
import { getMyForms } from '@/lib/api/client'

const THERAPY_LABELS: Record<string, string> = {
  osteopathy: 'Osteopatia',
  physiotherapy: 'Fisioterapia',
  rpg: 'RPG',
  nesa: 'NESA',
  'massagem-terapeutica': 'Massagem Terapêutica',
  'pilates-terapeutico': 'Pilates Terapêutico',
}

function formTitle(formKey: string, therapy: string | null): string {
  if (formKey === 'ficha_geral') return 'Ficha geral'
  if (therapy && THERAPY_LABELS[therapy]) return `Ficha de ${THERAPY_LABELS[therapy]}`
  return 'Ficha'
}

// Status reflects the review state honestly — a submitted ficha is never shown as
// "concluído" (SPEC-portal §10.3); it is always "for review" until a therapist acts.
const REVIEW: Record<string, { label: string; tone: StatusTone }> = {
  pending_review: { label: 'Enviado para revisão', tone: 'info' },
  in_review: { label: 'Em revisão', tone: 'info' },
  approved: { label: 'Revisto', tone: 'success' },
  rejected: { label: 'Requer atenção', tone: 'warning' },
}

function review(state: string): { label: string; tone: StatusTone } {
  return REVIEW[state] ?? { label: 'Enviado para revisão', tone: 'info' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function FormsPage() {
  // A hard fetch failure surfaces error.tsx; an empty list is the empty state.
  const submissions = await getMyForms()

  return (
    <div className="flex flex-col gap-4">
      {submissions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Sem fichas enviadas"
          description="As fichas que enviar aparecerão aqui para acompanhar a revisão."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map((s) => {
            const r = review(s.reviewState)
            return (
              <div
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {formTitle(s.formKey, s.therapy)}
                  </p>
                  <p className="text-xs text-text-secondary">Enviada a {formatDate(s.submittedAt)}</p>
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
        As fichas de admissão são preenchidas na clínica. Aqui pode acompanhar o estado das fichas
        que enviou.
      </p>
    </div>
  )
}
