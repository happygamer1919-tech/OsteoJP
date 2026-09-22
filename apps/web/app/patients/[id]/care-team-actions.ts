"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { assignTherapist, removeTherapist } from "@/lib/admin/care-team";
import { isAdminError } from "@/lib/admin/errors";

/**
 * CARE-01 — reception assigns and removes the therapists who follow a patient.
 *
 * The shape is the one `app/admin/staff/actions.ts` established: coerce the
 * FormData, delegate every rule to the lib layer, turn a refusal into a `?m=`
 * code the page renders, then revalidate and redirect. No validation lives
 * here, so there is exactly one place a rule can be wrong.
 */

async function run(
  formData: FormData,
  fn: (actor: Awaited<ReturnType<typeof requireRequestContext>>, patientId: string, userId: string) => Promise<void>,
): Promise<void> {
  const actor = await requireRequestContext();
  const patientId = String(formData.get("patientId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  let code = "ok";
  try {
    await fn(actor, patientId, userId);
  } catch (e) {
    // A capability refusal (ForbiddenError) lands here too, and becomes the same
    // opaque code as any other failure: the page must not tell a caller which
    // door was locked.
    code = isAdminError(e) ? `err:${e.code}` : "err";
  }
  revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}?tab=resumo&m=${code}`);
}

export async function assignTherapistAction(formData: FormData): Promise<void> {
  await run(formData, (actor, patientId, userId) => assignTherapist(actor, patientId, userId));
}

export async function removeTherapistAction(formData: FormData): Promise<void> {
  await run(formData, (actor, patientId, userId) => removeTherapist(actor, patientId, userId));
}
