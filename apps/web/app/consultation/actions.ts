"use server";

// W4-06 — start-consultation actions for the AI recording chain.
//   - createStubPatientAction: quick-create a stub patient (name required,
//     phone optional) reusing the existing createPatient path — the 0029 trigger
//     assigns patient_number on NULL (migration-free). Identity is human-entered
//     ONLY; the AI never fills identity.
//   - startConsultationAction: the SERVER-ENFORCED consent gate. Recording
//     cannot start until consent is given: the action REJECTS without it, and on
//     consent writes a PII-free actor+timestamp audit entry
//     (`patient.recording_consent`) before returning ok (DECISIONS 2026-07-06
//     "AI recording consent", JP).

import { eq } from "drizzle-orm";
import { can } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import { requireRequestContext, runScoped } from "@/lib/auth/context";
import { createPatient } from "@/lib/patients/actions";
import { writeAudit } from "@/lib/patients/audit";

export type StubResult =
  | { ok: true; patientId: string }
  | { ok: false; error: "validation" | "forbidden" };

/**
 * Quick-create a stub patient at record time. Name required, phone optional —
 * enforced by the existing createPatient validation. Returns the new patient id
 * so the flow proceeds identically to the existing-patient path.
 */
export async function createStubPatientAction(input: {
  fullName: string;
  phone?: string | null;
}): Promise<StubResult> {
  try {
    const p = await createPatient({ fullName: input.fullName, phone: input.phone ?? null });
    return { ok: true, patientId: p.id };
  } catch (e) {
    // createPatient throws ValidationError on an empty name; forbidden on role.
    const name = (e as { name?: string })?.name ?? "";
    if (name === "ValidationError") return { ok: false, error: "validation" };
    return { ok: false, error: "forbidden" };
  }
}

export type StartResult =
  | { ok: true }
  | { ok: false; error: "consent_required" | "not_found" | "forbidden" };

/**
 * The consent gate. Recording is a clinician action (`clinical_records:author`
 * = therapist/owner). Server-enforced: without `consent === true` this returns
 * `consent_required` and writes NOTHING — the client cannot bypass the gate by
 * calling the action directly. On consent, records a PII-free consent entry
 * (actor from JWT + timestamp) tied to the patient.
 */
export async function startConsultationAction(input: {
  patientId: string;
  consent: boolean;
}): Promise<StartResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  // SERVER-ENFORCED consent gate — never trust the client's disabled button.
  if (input.consent !== true) return { ok: false, error: "consent_required" };
  if (!input.patientId) return { ok: false, error: "not_found" };

  const found = await runScoped(ctx, async (tx) => {
    const [p] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.id, input.patientId))
      .limit(1);
    if (!p) return false;
    // Minimum-viable consent record: actor (ctx.userId) + timestamp
    // (created_at default), tied to the patient. No PII in metadata (rule 7).
    await writeAudit(tx, ctx, {
      action: "patient.recording_consent",
      entityId: input.patientId,
      metadata: { consultation: true },
    });
    return true;
  });
  if (!found) return { ok: false, error: "not_found" };
  return { ok: true };
}
