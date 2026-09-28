"use client";
import { GlassStatusChip } from "@osteojp/ui";

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
 *     distinct, separately-gated action, exactly like the author flow's Assinar.
 *     SIGN-CONFIRM-AND-SAVE-FIRST: RecordForm draws it behind a confirmation
 *     and saves unsaved edits first (see `sign` below); it is no longer a form
 *     of its own that finalizes on one press.
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
  dataHash,
  startsUnsaved,
  patientSex,
  patientId,
  reviewStateLabel,
}: {
  recordId: string;
  schema: TemplateSchema;
  initialData: Record<string, unknown>;
  saveAction: (prev: SaveState, formData: FormData) => Promise<SaveState>;
  finalizeAction: (expectedDataHash: string) => Promise<void>;
  /** Fingerprint of the stored content this page was rendered from. */
  dataHash: string;
  /** The editor shows content that is not stored yet (see the page). */
  startsUnsaved: boolean;
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

  // Finalizar stays a SEPARATE action from the data save (a record_status +
  // ai_review_state transition); RecordForm only puts it behind the
  // confirmation and runs the save first when there is something to save.
  return (
    <RecordForm
      schema={schema}
      initialData={initialData}
      readOnly={false}
      saveAction={saveAction}
      statusChip={statusChip}
      extraActions={null}
      patientSex={patientSex}
      patientId={patientId}
      recordId={recordId}
      sign={{
        action: finalizeAction,
        label: s["review.finalize"],
        message: s["review.finalizeConfirm"],
        dataHash,
        startsUnsaved,
      }}
    />
  );
}
