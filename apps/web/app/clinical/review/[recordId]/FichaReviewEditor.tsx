"use client";
import { Button, GlassStatusChip } from "@osteojp/ui";

import { RecordForm, type SaveState } from "@/app/clinical/[id]/RecordForm";
import type { TemplateSchema } from "@/lib/clinical/form-template";
import { s } from "@/lib/i18n";

/**
 * Ficha Médica REVIEW editor (W5-17). Assumir on an AI draft lands here: the
 * SAME Ficha Médica RecordForm (W5-13/14/15/16) the author flow uses, so the
 * twelve AI-filled fields (projected from `_aiIngestionRaw` server-side) render
 * in their Ficha Médica fields, EDITABLE, and every non-AI field renders
 * empty/editable for the reviewer to complete.
 *
 * The two clinical axes stay SEPARATE (CLAUDE.md rule #4):
 *   * Guardar → saveFichaReviewAction → saveReviewFicha: writes `data` ONLY,
 *     never status / ai_review_state.
 *   * Finalizar → finalizeAction → finalizeReview: signs (record_status →
 *     signed) AND approves (ai_review_state → approved) in ONE statement. It is a
 *     distinct, separately-gated action, rendered in its OWN form (outside the
 *     record form), exactly like the author flow's Assinar.
 *
 * A finalized record is immutable (the DB trigger is the wall); after finalize
 * the record leaves the review path and lives in the normal clinical viewer /
 * the patient's Registos clínicos.
 */
export function FichaReviewEditor({
  recordId,
  schema,
  initialData,
  saveAction,
  finalizeAction,
  patientSex,
  patientId,
  reviewStateLabel,
}: {
  recordId: string;
  schema: TemplateSchema;
  initialData: Record<string, unknown>;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  finalizeAction: () => Promise<void>;
  patientSex?: string | null;
  patientId: string;
  reviewStateLabel: string;
}) {
  // The ai_review_state chip (the review axis) — kept visually distinct from the
  // record_status axis. In this editor the record is a draft under review, so the
  // record_status is implicitly "rascunho"; we surface the REVIEW axis here since
  // that is the axis this screen advances (to "aprovada") on finalize.
  const statusChip = (
    <GlassStatusChip tone="info" dot>
      {reviewStateLabel}
    </GlassStatusChip>
  );

  const extraActions = (
    // Finalizar is its OWN form (a record_status + ai_review_state transition),
    // never nested inside the record form. Signing + approving stay together and
    // separate from the data save above.
    <form action={finalizeAction}>
      <Button type="submit" variant="primary">
        {s["review.finalize"]}
      </Button>
    </form>
  );

  return (
    <RecordForm
      schema={schema}
      initialData={initialData}
      readOnly={false}
      saveAction={saveAction}
      statusChip={statusChip}
      extraActions={extraActions}
      patientSex={patientSex}
      patientId={patientId}
      recordId={recordId}
    />
  );
}
