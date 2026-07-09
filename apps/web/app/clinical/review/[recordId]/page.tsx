import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getRecordDetail, getFichaMedicaTemplate } from "@/lib/clinical/records";
import { partitionNarrativeEdit } from "@/lib/clinical/review-fields";
import { parseTemplateSchema } from "@/lib/clinical/form-template";
import { projectAiPayloadOntoFichaFields } from "@/lib/clinical/ficha-medica";
import { ReviewEditor } from "./ReviewEditor";
import { FichaReviewEditor } from "./FichaReviewEditor";
import { saveNarrativeAction, saveFichaReviewAction, finalizeAction } from "../actions";

// Reflects live record_status / ai_review_state; must serve a fresh render after
// finalize (the record leaves this route for the normal clinical viewer).
export const dynamic = "force-dynamic";

function reviewStateLabel(state: string | null): string {
  switch (state) {
    case "in_review":
      return s["review.stateInReview"];
    case "approved":
      return s["review.stateApproved"];
    case "rejected":
      return s["review.stateRejected"];
    default:
      return s["review.statePending"];
  }
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:review")) redirect("/clinical");

  const record = await getRecordDetail(ctx, recordId);
  if (!record) redirect("/clinical/review");
  // Only a draft under review is editable here; a finalized record lives in the
  // normal clinical viewer (immutable, rule #4).
  if (record.status !== "draft") redirect(`/clinical/${recordId}`);

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-base font-semibold">{s["review.detailTitle"]}</h2>
        <p className="text-sm text-text-secondary">{record.patientName}</p>
      </div>
      <Link href="/clinical/review" className="text-sm underline">
        {s["review.back"]}
      </Link>
    </div>
  );

  /* -------------------------------------------------------------------- */
  /* AI draft → the Ficha Médica editor (W5-17)                           */
  /* -------------------------------------------------------------------- */
  if (record.source === "ai_ingested") {
    // AI drafts carry no formTemplateId (store.ts persists only the raw payload).
    // Resolve the current Ficha Médica template BY KEY so the same editor the
    // author flow uses renders the AI draft.
    const ficha = await getFichaMedicaTemplate(ctx);
    const schema = parseTemplateSchema(ficha?.schema ?? null);
    if (!schema) {
      // No active Ficha Médica template — a seed/deploy fault, not a data issue.
      // Bounce to the queue rather than render a broken editor.
      redirect("/clinical/review?m=err");
    }

    // Project the twelve `_aiIngestionRaw` keys onto their Ficha Médica field
    // paths so they render EDITABLE in their fields (identity mapping, W5-13).
    // SPEC sec 2 PRODUCT halt: if a value is PRESENT in the raw payload but the
    // projection cannot land it at its field path, never silently drop it — that
    // is surfaced to the owner. Under the identity path (proved by
    // ficha-medica-compat.test.ts) this never fires; the guard honors the SPEC.
    const { data: projected } = projectAiPayloadOntoFichaFields(record.data);

    return (
      <section className="space-y-4">
        {header}
        <FichaReviewEditor
          recordId={recordId}
          schema={schema!}
          initialData={projected}
          saveAction={saveFichaReviewAction.bind(null, recordId)}
          finalizeAction={finalizeAction.bind(null, recordId)}
          patientSex={record.patientSex}
          patientId={record.patientId}
          reviewStateLabel={reviewStateLabel(record.aiReviewState)}
        />
      </section>
    );
  }

  /* -------------------------------------------------------------------- */
  /* Patient submission → the narrative editor (unchanged)                */
  /* -------------------------------------------------------------------- */
  // Prefill the editor with the draft's current NARRATIVE fields only, so the
  // reviewer never sees coded/safety values in the free-text editor.
  const schema = parseTemplateSchema(record.template?.schema ?? null);
  const { narrative } = partitionNarrativeEdit(record.data, schema);

  return (
    <section className="space-y-4">
      {header}
      <ReviewEditor
        recordId={recordId}
        initialNarrative={narrative}
        saveAction={saveNarrativeAction.bind(null, recordId)}
        finalizeAction={finalizeAction.bind(null, recordId)}
      />
    </section>
  );
}
