"use server";

// W5-30 — password-gated clinical-record lifecycle actions on the patient
// profile "Registos clínicos" tab. Both:
//   1. requireRequestContext()              — verified caller
//   2. can(ctx.role, "clinical_records:author") — app-layer permission gate
//   3. verifyDeletePassword(ctx, password)  — shared scrypt delete-password gate
//      (W5-08 / W3-06; the same tenant "appointmentDeletePasswordHash" secret)
//   4. lib fn does the tenant-scoped (RLS) DB work + audit in one tx
// The clinical_records immutability trigger is never touched: hard delete is
// draft/AI-pending only, and Anular is an append-only INSERT into
// record_annulments (the signed record row is untouched).

import { revalidatePath } from "next/cache";
import { can } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import { verifyDeletePassword } from "@/lib/admin/appointment-delete-password";
import { hardDeleteClinicalRecord, annulRecord } from "@/lib/clinical/records";
import { isClinicalError, type ClinicalErrorCode } from "@/lib/clinical/errors";

export type RecordActionError = "forbidden" | "validation" | "password" | ClinicalErrorCode | "error";
export type RecordActionResult = { ok: true } | { ok: false; error: RecordActionError };

/** Hard-delete a draft / AI-pending ficha behind the delete-password gate. */
export async function hardDeleteRecordAction(
  recordId: string,
  patientId: string,
  password: string,
): Promise<RecordActionResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  if (!recordId || !patientId || !password) return { ok: false, error: "validation" };
  if (!(await verifyDeletePassword(ctx, password))) return { ok: false, error: "password" };
  try {
    await hardDeleteClinicalRecord(ctx, recordId);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true };
  } catch (e) {
    if (isClinicalError(e)) return { ok: false, error: e.code };
    // Secret/PII-safe (rule 7): error NAME only.
    console.error("clinical: hardDeleteRecord failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}

/** Anular (void) a signed ficha behind the delete-password gate; reason optional. */
export async function annulRecordAction(
  recordId: string,
  patientId: string,
  password: string,
  reason: string | null,
): Promise<RecordActionResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  if (!recordId || !patientId || !password) return { ok: false, error: "validation" };
  if (!(await verifyDeletePassword(ctx, password))) return { ok: false, error: "password" };
  try {
    await annulRecord(ctx, recordId, reason);
    revalidatePath(`/patients/${patientId}`);
    return { ok: true };
  } catch (e) {
    if (isClinicalError(e)) return { ok: false, error: e.code };
    console.error("clinical: annulRecord failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}
