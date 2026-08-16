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
import { createStubPatient } from "@/lib/patients/actions";
import { writeAudit } from "@/lib/patients/audit";
import { AudioStorageConfigError, signAudioUpload } from "@/lib/consultation/audio-storage";
import { attemptFire, recordOutcome } from "@/lib/consultation/fire-attempt";
import { persistConsultation } from "@/lib/consultation/consultation-store";

export type StubResult =
  | { ok: true; patientId: string }
  | { ok: false; error: "validation" | "forbidden" };

/**
 * Quick-create a stub patient at record time. Name required, phone optional.
 *
 * PL-31 — goes through `createStubPatient`, NOT `createPatient`. A NIF is now
 * mandatory to create a ficha, and routing this through the normal path would
 * have broken start-consultation entirely: the therapist would be blocked from
 * recording a walk-in until someone produced a tax number. The owner ruled this
 * path keeps name + phone; the patient is marked ficha incompleta instead and
 * cannot have a declaração issued until the NIF is supplied.
 */
export async function createStubPatientAction(input: {
  fullName: string;
  phone?: string | null;
}): Promise<StubResult> {
  try {
    const p = await createStubPatient({ fullName: input.fullName, phone: input.phone ?? null });
    return { ok: true, patientId: p.id };
  } catch (e) {
    // createStubPatient throws ValidationError on an empty name; forbidden on role.
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

export type SignUploadResult =
  | { ok: true; url: string; objectKey: string }
  | { ok: false; error: "forbidden" | "validation" | "config" };

/**
 * W4-08 — sign a presigned PUT so the browser uploads the recorded blob DIRECT
 * to S3 (never through Vercel). Recording is a clinician action. The object key
 * is derived server-side from the JWT tenant (never the payload). The scoped AWS
 * key never leaves the server — only the presigned URL + object key cross to the
 * client. If the env is not configured this returns `config` (never a stub key).
 */
export async function signAudioUploadAction(input: {
  patientId: string;
  consultationStartedAt: string;
}): Promise<SignUploadResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  if (!input.patientId || !input.consultationStartedAt) return { ok: false, error: "validation" };
  try {
    // tenantId from JWT context, NEVER from the payload (hard rule 3).
    const { url, objectKey } = await signAudioUpload(
      ctx.tenantId,
      input.patientId,
      input.consultationStartedAt,
    );
    return { ok: true, url, objectKey };
  } catch (e) {
    if (e instanceof AudioStorageConfigError) return { ok: false, error: "config" };
    return { ok: false, error: "config" };
  }
}

/**
 * FOUR OUTCOMES, AND THE LAST TWO ARE THE POINT OF 0064.
 *
 * `pending` and `not_persisted` are both "the fire did not succeed", and
 * collapsing them into one error is exactly what made this path lose
 * consultations: the client showed "O processamento será retomado" for both,
 * and only one of them was ever true. They are separate values so the screen
 * can only promise a retry when a row exists to be retried.
 */
export type FireWebhookResult =
  /** Delivered. 2xx, or 409 = already there from an attempt we never saw. */
  | { ok: true }
  /** Refused before anything was written. No row, nothing to resume. */
  | { ok: false; error: "forbidden" | "validation" }
  /** Persisted as pending. The Inngest scanner WILL re-fire it. */
  | { ok: false; error: "pending"; consultationId: string }
  /** The persist itself failed. NOTHING will resume this one. */
  | { ok: false; error: "not_persisted" };

/**
 * W4-09 — after the upload lands, persist the consultation and fire the M1
 * webhook (André's Make scenario) with the full contract + `x-make-apikey` (from
 * env). `doctor_id` is the recording clinician (JWT userId, READ-ONLY). The
 * object key is verified tenant-prefixed (defense). The webhook key is never
 * returned or logged.
 *
 * 0064 — THE ROW IS WRITTEN BEFORE THE FIRE, and the order is the fix. Before
 * this, nothing was persisted at fire time: the object key, the patient, the
 * clinician and both timestamps existed only in React state in Recorder.tsx, so
 * a failed fire lost every value needed to try again. The scoped S3 credential
 * cannot list the bucket, so the orphaned audio could not be found by hand
 * either, and a 7-day lifecycle then deleted it.
 *
 * Timestamps are forwarded from the recording and stored verbatim; the retry
 * reads them back rather than re-stamping, because the partner's idempotency
 * key is patient_id + those two instants.
 */
export async function fireConsultationWebhookAction(input: {
  objectKey: string;
  patientId: string;
  consultationStartedAt: string;
  consultationEndedAt: string;
}): Promise<FireWebhookResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  if (
    !input.objectKey ||
    !input.patientId ||
    !input.consultationStartedAt ||
    !input.consultationEndedAt
  ) {
    return { ok: false, error: "validation" };
  }
  if (!input.objectKey.startsWith(`${ctx.tenantId}/`)) return { ok: false, error: "forbidden" };

  // STEP 1, BEFORE ANY FIRE. If this throws, nothing is recoverable and the
  // caller must not be told a retry is coming.
  let row: { id: string; attemptCount: number; fireStatus: string };
  try {
    row = await persistConsultation({
      tenantId: ctx.tenantId, // JWT, never the payload (rule 3)
      patientId: input.patientId,
      doctorId: ctx.userId,
      audioObjectKey: input.objectKey,
      consultationStartedAt: input.consultationStartedAt,
      consultationEndedAt: input.consultationEndedAt,
    });
  } catch (e) {
    // Ids are not available (there is no row), so this line carries the patient
    // and the error class only. No payload, no audio key — the key is the one
    // thing that would have made it recoverable and it is now lost with it.
    console.error(
      `[consultation] PERSIST FAILED, consultation is unrecoverable ` +
        `patient=${input.patientId} error=${e instanceof Error ? e.name : "unknown"}`,
    );
    return { ok: false, error: "not_persisted" };
  }

  // A duplicate submit for a consultation already delivered. Firing again would
  // earn a 409 and be classified delivered anyway, but it would burn an attempt
  // and put a spurious conflict in the partner's log for no information.
  if (row.fireStatus === "fired") return { ok: true };

  const attempt = row.attemptCount + 1;
  const outcome = await attemptFire(
    {
      id: row.id,
      patientId: input.patientId,
      doctorId: ctx.userId,
      audioObjectKey: input.objectKey,
      consultationStartedAt: input.consultationStartedAt,
      consultationEndedAt: input.consultationEndedAt,
    },
    attempt,
  );
  await recordOutcome({ id: row.id, patientId: input.patientId }, outcome, new Date());

  if (outcome.verdict === "delivered") return { ok: true };
  return { ok: false, error: "pending", consultationId: row.id };
}
