"use server";

// W6-04 - owner-gated wrappers for the "Pacientes eliminados" recovery view.
// The view and its actions are OWNER-ONLY (patients:recover), enforced
// server-side here (not just by hiding the nav tab). These wrap the existing
// shared patient actions (which keep their own broader gates + audit rows for
// the patient-profile flow) so this management surface can be locked to owner
// without changing the shared actions.

import { can } from "@osteojp/auth";
import { requireRequestContext } from "@/lib/auth/context";
import {
  hardDeletePatient,
  restorePatient,
  type HardDeletePatientResult,
} from "@/lib/patients/actions";

export type RecoverActionResult = { ok: true } | { ok: false; error: "forbidden" | "error" };

/**
 * Restore a soft-deleted patient to the active list. Owner-only. Reuses
 * restorePatient (which re-checks patients:delete, refuses merged losers by
 * design, and writes the patient.restore audit row).
 */
export async function restoreDeletedPatientAction(patientId: string): Promise<RecoverActionResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "patients:recover")) return { ok: false, error: "forbidden" };
  try {
    await restorePatient(patientId);
    return { ok: true };
  } catch (e) {
    console.error("recover: restore failed", e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "error" };
  }
}

/**
 * Permanently delete a patient with NO associated data, behind the scrypt
 * password gate. Owner-only here; hardDeletePatient additionally enforces
 * settings:manage + the no-associated-data guards + the audit row. The password
 * is never logged (rule 7).
 */
export async function permanentDeletePatientAction(
  patientId: string,
  password: string,
): Promise<HardDeletePatientResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "patients:recover")) return { ok: false, error: "forbidden" };
  return hardDeletePatient(patientId, password);
}
