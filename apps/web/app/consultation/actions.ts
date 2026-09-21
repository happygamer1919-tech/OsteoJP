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

import { and, eq } from "drizzle-orm";
import { can } from "@osteojp/auth";
import { patients } from "@osteojp/db";
import { requireRequestContext, runScoped, type RequestContext } from "@/lib/auth/context";
import { scopedLocationId } from "@/lib/auth/location-choice";
import { bookingLocationScope } from "@/lib/auth/viewer-locations";
import { createStubPatient } from "@/lib/patients/actions";
import { therapistPatientScope } from "@/lib/patients/scope";
import { writeAudit } from "@/lib/patients/audit";
import { signAudioUpload } from "@/lib/consultation/audio-storage";
import { attemptFire, recordOutcome } from "@/lib/consultation/fire-attempt";
import { persistConsultation } from "@/lib/consultation/consultation-store";

export type StubResult =
  | { ok: true; patientId: string }
  | { ok: false; error: "validation" | "forbidden"; message?: string };

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
  /** PL-34 — the clinic this walk-in is being seen at. Honoured only when the
   *  caller may book there; see `resolveStubLocationId`. */
  locationId?: string | null;
}): Promise<StubResult> {
  try {
    // INC-nif-validationerror-at-the-desk: `createStubPatient` no longer THROWS
    // on operator input, it returns the refusal. The catch below is kept, and
    // kept meaning what it always meant - a role failure, or anything else the
    // person at the screen cannot act on. It is no longer the path an empty
    // name takes.
    //
    // THE MESSAGE IS CARRIED THROUGH rather than collapsed into "validation".
    // The caller (StartConsultation) has one box, so the field adds nothing
    // there; the sentence does, and it is the sentence the desk could not see.
    const r = await createStubPatient({
      fullName: input.fullName,
      phone: input.phone ?? null,
      // PL-34 — RESOLVED ON THE SERVER, NOT TAKEN FROM THE CLIENT. This module
      // is "use server", so `locationId` is a browser-supplied value on a path
      // that decides which clinic can see the resulting patient.
      primaryLocationId: await resolveStubLocationId(input.locationId ?? null),
    });
    if (!r.ok) return { ok: false, error: "validation", message: r.error.message };
    return { ok: true, patientId: r.patient.id };
  } catch (e) {
    // A ValidationError can still arrive here if some future path throws one
    // outside the action's own parse - it is reported as validation rather than
    // as forbidden, because that is what it is.
    const name = (e as { name?: string })?.name ?? "";
    if (name === "ValidationError") return { ok: false, error: "validation" };
    return { ok: false, error: "forbidden" };
  }
}

/**
 * PL-34 — the clinic a walk-in stub is filed at.
 *
 * ==========================================================================
 * THE DEFECT THIS CLOSES
 * ==========================================================================
 * This action passed `fullName` and `phone` and nothing else, so every stub
 * landed with `primary_location_id = NULL`. That column is one of the two things
 * PL-09 scopes a patient by (the other is an appointment at the viewer's clinic,
 * and a stub has neither yet), so a walk-in registered mid-consultation was
 * invisible to every located reception and admin — the people who then have to
 * find them to book the follow-up or issue the invoice. The therapist who
 * created them could still see them, through `therapistPatientScope`'s
 * `created_by` arm, which is exactly why nobody noticed at the desk that made it.
 *
 * `/patients/new` already resolves this (PL-15b, `app/patients/new/page.tsx`).
 * This path was left behind because it is a two-field box on another screen.
 *
 * ==========================================================================
 * THE SAME PL-14 DECISION, TAKEN ON THE SERVER
 * ==========================================================================
 * `bookingLocationScope` rather than `viewerLocationScope`: the read scope
 * returns `null` for a therapist by design, and a therapist is the principal
 * this action exists for. The write scope is the one that answers "which clinics
 * is this person actually at".
 *
 * `scopedLocationId` then gives the three answers PL-14 already ruled:
 *   one assigned clinic  -> that one, ALWAYS, whatever the browser sent;
 *   several              -> the browser's choice, but only from that set;
 *   unrestricted (owner) -> the browser's choice, re-checked against the tenant
 *                           by `createPatientImpl`, which rejects an id that does
 *                           not resolve under the caller's RLS.
 *
 * NULL IS STILL REACHABLE and is left reachable on purpose: a multi-clinic
 * therapist who somehow submits without a choice gets the old behaviour rather
 * than a refusal in the middle of a consultation. The screen makes the picker
 * required, so the reachable case is a direct action call.
 */
async function resolveStubLocationId(requested: string | null): Promise<string | null> {
  const ctx = await requireRequestContext();
  return scopedLocationId(await bookingLocationScope(ctx), requested);
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

  // The SAME read the two actions below make, so a patient this screen accepts
  // is a patient the recording chain accepts and no more. The narrowing is here
  // so that one rule reads the same in all three.
  const scope = therapistPatientScope(ctx, patients.id);
  const byId = eq(patients.id, input.patientId);
  const found = await runScoped(ctx, async (tx) => {
    const [p] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(scope ? and(byId, scope) : byId)
      .limit(1);
    if (!p) return false;
    // Minimum-viable consent record: actor (ctx.userId) + timestamp
    // (created_at default), tied to the patient. No PII in metadata (rule 7).
    await writeAudit(tx, ctx, {
      action: "patient.recording_consent",
      entityId: p.id,
      metadata: { consultation: true },
    });
    return true;
  });
  if (!found) return { ok: false, error: "not_found" };
  return { ok: true };
}

/**
 * THE PATIENT IS THE SERVER'S ANSWER.
 *
 * ==========================================================================
 * WHY THE ID IS SETTLED HERE, ONCE, FOR ALL THREE ACTIONS
 * ==========================================================================
 * The recording flow crosses boundaries a per-request scope does not follow:
 * `persistConsultation` writes on the service-role handle (`getDbAdmin`, whose
 * own doc comment says never to use it for tenant-scoped request handling), the
 * M1 fire hands the id and a one-hour signed audio URL to a third-party
 * processor, and `signAudioUploadAction` mints a write capability into one
 * patient's audio folder. `consultations.patient_id` is a single-column FK to
 * `patients(id)`, and the partner files its reply back by that same id.
 *
 * So the patient's identity is settled BEFORE any of that, by a read the
 * database answers rather than by a shape check on the request, and it is
 * settled in ONE place so all three actions agree. CLAUDE.md asks for the
 * server-side check IN the action with RLS as defense-in-depth: this helper is
 * the server-side half, and 0074's `patients_select` is the other.
 *
 * ==========================================================================
 * WHY `therapistPatientScope` ALONE IS THE WHOLE RULE HERE
 * ==========================================================================
 * `lib/patients/queries.ts` (getPatient) and `lib/patients/documents.ts`
 * (documentVisibilityScope) fall back to `patientLocationScope` for a located
 * receptionist or admin. These actions need no such arm, and the omission is a
 * decision rather than an oversight: every caller below first requires
 * `clinical_records:author`, which `packages/auth/permissions.ts` grants to
 * owner and therapist and DENIES to admin and reception —
 * `lib/auth/permission-matrix.test.ts` pins that denial independently of
 * PERMISSIONS, so a future grant cannot quietly widen this. Owner is
 * unrestricted within the tenant; therapist is the only narrowed role that
 * reaches here. Adding `patientLocationScope` would also be a new call site
 * `lib/patients/scope-call-sites.test.ts` would have to carry for a role that
 * never arrives.
 *
 * Returns the id AS THE DATABASE ANSWERED IT — the value every write downstream
 * must then use — or `null`. Callers refuse with `forbidden` rather than with a
 * not-found arm: whether a uuid names a real patient is not a fact this action
 * owes a caller who may not see them.
 */
async function recordablePatientId(
  ctx: RequestContext,
  requestedId: string,
): Promise<string | null> {
  const scope = therapistPatientScope(ctx, patients.id);
  const byId = eq(patients.id, requestedId);
  return runScoped(
    ctx,
    async (tx) => {
      const [p] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(scope ? and(byId, scope) : byId)
        .limit(1);
      return p?.id ?? null;
    },
    "consultation:patient-scope",
  );
}

export type SignUploadResult =
  | { ok: true; url: string; objectKey: string }
  | { ok: false; error: "forbidden" | "validation" | "config" };

/**
 * W4-08 — sign a presigned PUT so the browser uploads the recorded blob DIRECT
 * to S3 (never through Vercel). Recording is a clinician action. The object key
 * is derived server-side from the JWT tenant (never the payload). The scoped AWS
 * key never leaves the server — only the presigned URL + object key cross to the
 * client. If the slot cannot be minted this returns `config` (never a stub key).
 */
export async function signAudioUploadAction(input: {
  patientId: string;
  consultationStartedAt: string;
}): Promise<SignUploadResult> {
  const ctx = await requireRequestContext();
  if (!can(ctx.role, "clinical_records:author")) return { ok: false, error: "forbidden" };
  if (!input.patientId || !input.consultationStartedAt) return { ok: false, error: "validation" };
  try {
    // A presigned PUT is a WRITE CAPABILITY into this patient's folder, handed
    // to a browser. It is minted only for a patient this clinician may record.
    //
    // INSIDE THE TRY ON PURPOSE. This action now makes a database read, so it
    // has a fault mode it did not have when its only dependency was the signer.
    // An action that REJECTS rather than returning a member of its result union
    // leaves the recorder pinned mid-phase with no error surface, because the
    // client awaits it directly. Every exit from here is a value.
    const patientId = await recordablePatientId(ctx, input.patientId);
    if (!patientId) return { ok: false, error: "forbidden" };
    // tenantId from JWT context, NEVER from the payload (hard rule 3); patientId
    // from the scoped read above, for the same reason.
    const { url, objectKey } = await signAudioUpload(
      ctx.tenantId,
      patientId,
      input.consultationStartedAt,
    );
    return { ok: true, url, objectKey };
  } catch (e) {
    // ONE ARM, TWO CAUSES, AND THAT IS DELIBERATE. `AudioStorageConfigError`
    // (the env is not configured) and a fault in the scope read both land here,
    // and both used to be written out as two branches returning the same value.
    // The caller's only question is "was an upload URL minted", so `config` is
    // the whole answer; the recorder maps it to `upload_error` either way. What
    // must never happen is a rejection, which is why the read is inside.
    //
    // LOGGED, because the two causes need different people. The user-facing
    // copy for this arm talks about storage authorisation, so a database fault
    // would send the clinician and support to S3 for something that is not
    // there. The TENANT comes from the JWT and the class name from the error;
    // the requested patient id is deliberately NOT here, because at this point
    // it is unvalidated client input and a log line is not the place for it.
    console.error(
      `[consultation] UPLOAD SLOT NOT MINTED ` +
        `tenant=${ctx.tenantId} error=${e instanceof Error ? e.name : "unknown"}`,
    );
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

  // STEP 0, BEFORE ANY WRITE AND BEFORE ANY SEND: the id used from here down is
  // this read's answer, for the reason the helper's header gives.
  //
  // A FAULT HERE IS `not_persisted`, NOT A REFUSAL AND NOT A RETRY. If the read
  // throws, nothing has been written and nothing will re-fire, which is exactly
  // what `not_persisted` says and what the recorder shows as `fire_unsaved`.
  // Letting it reject instead would pin the recorder at "firing" with the audio
  // already in S3 and no row behind it - the silent loss 0064 exists to end.
  let patientId: string | null;
  try {
    patientId = await recordablePatientId(ctx, input.patientId);
  } catch (e) {
    // Logged for the same reason the signer's catch is, and on the higher-value
    // path: the outcome here is `fire_unsaved`, the audio is already in S3, and
    // a lifecycle rule deletes the object days later. Without this line a pool
    // outage that loses a consultation leaves no server-side trace at all.
    // Tenant from the JWT, error class only - the requested patient id is still
    // unvalidated client input at this point and stays out of the log.
    console.error(
      `[consultation] SCOPED READ FAULTED, consultation not persisted ` +
        `tenant=${ctx.tenantId} error=${e instanceof Error ? e.name : "unknown"}`,
    );
    return { ok: false, error: "not_persisted" };
  }
  if (!patientId) return { ok: false, error: "forbidden" };

  // The key must name this patient's folder as well as this tenant's: the audio
  // attached to a consultation is audio signed for that consultation's patient,
  // in the folder `audioObjectKey` builds. The tenant-prefix check above runs
  // first on purpose, so a key outside the caller's tenant is refused before any
  // query runs, and it is subsumed by this one.
  if (!input.objectKey.startsWith(`${ctx.tenantId}/${patientId}/`)) {
    return { ok: false, error: "forbidden" };
  }

  // STEP 1, BEFORE ANY FIRE. If this throws, nothing is recoverable and the
  // caller must not be told a retry is coming.
  let row: { id: string; attemptCount: number; fireStatus: string };
  try {
    row = await persistConsultation({
      tenantId: ctx.tenantId, // JWT, never the payload (rule 3)
      patientId, // the scoped read's answer, never the payload
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
        `patient=${patientId} error=${e instanceof Error ? e.name : "unknown"}`,
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
      patientId,
      doctorId: ctx.userId,
      audioObjectKey: input.objectKey,
      consultationStartedAt: input.consultationStartedAt,
      consultationEndedAt: input.consultationEndedAt,
    },
    attempt,
  );
  await recordOutcome({ id: row.id, patientId }, outcome, new Date());

  if (outcome.verdict === "delivered") return { ok: true };
  return { ok: false, error: "pending", consultationId: row.id };
}
