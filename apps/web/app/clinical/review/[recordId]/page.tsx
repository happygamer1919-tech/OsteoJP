import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@osteojp/auth";
import { s } from "@/lib/i18n";
import { requireRequestContext } from "@/lib/auth/context";
import { getRecordDetail } from "@/lib/clinical/records";
import { partitionNarrativeEdit } from "@/lib/clinical/review-fields";
import { parseTemplateSchema } from "@/lib/clinical/form-template";
import { ReviewEditor } from "./ReviewEditor";
import { saveNarrativeAction, finalizeAction } from "../actions";

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
  // normal clinical viewer.
  if (record.status !== "draft") redirect(`/clinical/${recordId}`);

  // Prefill the editor with the draft's current NARRATIVE fields only, so the
  // reviewer never sees coded/safety values in the free-text editor.
  const schema = parseTemplateSchema(record.template?.schema ?? null);
  const { narrative } = partitionNarrativeEdit(record.data, schema);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{s["review.detailTitle"]}</h2>
          <p className="text-sm text-text-secondary">{record.patientName}</p>
        </div>
        <Link href="/clinical/review" className="text-sm underline">
          {s["review.back"]}
        </Link>
      </div>

      <ReviewEditor
        recordId={recordId}
        initialNarrative={narrative}
        saveAction={saveNarrativeAction.bind(null, recordId)}
        finalizeAction={finalizeAction.bind(null, recordId)}
      />
    </section>
  );
}
