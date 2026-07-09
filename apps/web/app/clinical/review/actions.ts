"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  claimReviewItem,
  editReviewNarrative,
  finalizeReview,
  saveReviewFicha,
  type ReviewItemRef,
} from "@/lib/clinical/review";
import { getFichaMedicaTemplate } from "@/lib/clinical/records";
import { parseTemplateSchema } from "@/lib/clinical/form-template";
import { isClinicalError } from "@/lib/clinical/errors";
import type { ReviewSaveState } from "./[recordId]/ReviewEditor";
import type { SaveState } from "@/app/clinical/[id]/RecordForm";

/** Parse the queue-row form into a typed ReviewItemRef (server-trusted shape). */
function refFromForm(formData: FormData): ReviewItemRef | null {
  const source = String(formData.get("source") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return null;
  if (source === "ai") return { source: "ai", recordId: id };
  if (source === "patient") return { source: "patient", submissionId: id };
  return null;
}

/** Claim a queue item, then open its draft for narrative review. */
export async function claimAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  const ref = refFromForm(formData);
  if (!ref) redirect("/clinical/review");

  let recordId: string;
  try {
    ({ recordId } = await claimReviewItem(ctx, ref!));
  } catch {
    // already_reviewed / not_found / not_reviewable — bounce back to the queue.
    redirect("/clinical/review?m=err");
  }
  revalidatePath("/clinical/review");
  redirect(`/clinical/review/${recordId}`);
}

/** Save a narrative-only edit on a claimed draft. */
export async function saveNarrativeAction(
  recordId: string,
  _prev: ReviewSaveState,
  formData: FormData,
): Promise<ReviewSaveState> {
  const ctx = await requireRequestContext();
  let edit: Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(formData.get("narrative") ?? "{}"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, code: "invalidJson" };
    }
    edit = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, code: "invalidJson" };
  }
  try {
    await editReviewNarrative(ctx, recordId, edit);
  } catch (e) {
    if (isClinicalError(e)) {
      if (e.code === "not_narrative_field") {
        return { ok: false, code: "not_narrative_field", rejected: e.fieldErrors };
      }
      return { ok: false, code: e.code };
    }
    return { ok: false, code: "error" };
  }
  revalidatePath(`/clinical/review/${recordId}`);
  return { ok: true };
}

/**
 * Save the WHOLE Ficha Médica for a claimed AI draft (W5-17). The reviewer opens
 * the AI draft in the Ficha Médica editor and edits ANY field (the twelve
 * AI-filled ones AND the non-AI ones); this persists the full `data` while the
 * record stays a draft under review. Signing/approval is the SEPARATE
 * finalizeAction — this writes `data` only, never `status`/`ai_review_state`.
 *
 * Shares the `/clinical/[id]` RecordForm SaveState so the same form component
 * renders the save feedback in both the author and the review editors.
 */
export async function saveFichaReviewAction(
  recordId: string,
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const ctx = await requireRequestContext();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}")) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "error" };
  }
  // AI drafts carry no formTemplateId — resolve the Ficha Médica schema by key
  // so the payload is validated against the same template the editor rendered.
  const ficha = await getFichaMedicaTemplate(ctx);
  const schema = parseTemplateSchema(ficha?.schema ?? null);
  try {
    await saveReviewFicha(ctx, recordId, data, schema);
  } catch (e) {
    if (isClinicalError(e)) {
      return { ok: false, code: e.code, errors: e.fieldErrors };
    }
    return { ok: false, code: "error" };
  }
  revalidatePath(`/clinical/review/${recordId}`);
  return { ok: true };
}

/** Finalize: sign + lock the draft and approve the review. */
export async function finalizeAction(recordId: string): Promise<void> {
  const ctx = await requireRequestContext();
  let target = `/clinical/${recordId}`;
  try {
    await finalizeReview(ctx, recordId);
  } catch (e) {
    const code = isClinicalError(e) ? e.code : "err";
    target = `/clinical/review/${recordId}?m=${code}`;
  }
  revalidatePath("/clinical/review");
  redirect(target);
}
