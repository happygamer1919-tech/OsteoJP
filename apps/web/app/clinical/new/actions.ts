"use server";
import { redirect } from "next/navigation";
import { requireRequestContext } from "@/lib/auth/context";
import { createDraftRecord } from "@/lib/clinical/records";
import { isClinicalError } from "@/lib/clinical/errors";

export async function createRecordAction(formData: FormData): Promise<void> {
  const ctx = await requireRequestContext();
  const patientId = String(formData.get("patientId") ?? "");
  const formTemplateId = String(formData.get("formTemplateId") ?? "");
  const episodeId = String(formData.get("episodeId") ?? "") || null;

  let target = "/clinical/new?m=err";
  try {
    const { id } = await createDraftRecord(ctx, { patientId, formTemplateId, episodeId });
    target = `/clinical/${id}`;
  } catch (e) {
    if (!isClinicalError(e)) throw e;
  }
  redirect(target);
}
