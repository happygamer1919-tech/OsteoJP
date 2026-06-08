"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import {
  claimReviewItem,
  editReviewNarrative,
  finalizeReview,
  type ReviewItemRef,
} from "@/lib/clinical/review";
import { isClinicalError } from "@/lib/clinical/errors";
import type { ReviewSaveState } from "./[recordId]/ReviewEditor";

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
