import { createHash } from "node:crypto";
import { resolveOutcomeStatus, type IngestionStatus } from "./ingestion-status";

// Orchestration core for the AI ingestion endpoint — deliberately DB-agnostic.
// All database access is behind the IngestionStore seam so this logic is unit
// testable with an in-memory fake (see ingest.test.ts) and the real Drizzle /
// service_role implementation lives in store.ts.
//
// Hard architecture rule #3: tenant_id is NEVER read from the payload. It is
// resolved from the patient row (store.resolvePatientTenant) and then set
// explicitly on every write. The envelope type below has no tenant field by
// design, so reading it from the payload is structurally impossible here.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ingestion ENVELOPE — the transport fields we need to route, dedupe, and
 * link a request. The clinical content rides along as an opaque `payload`:
 * per-field validation and bodychart region→marker mapping are OUT OF SCOPE for
 * this shell and wait on Andrei's field list (TODO seams below + in store.ts).
 */
export type IngestionEnvelope = {
  idempotencyKey: string;
  requestId: string; // partner-supplied correlation id
  patientId: string;
  payload: Record<string, unknown>;
};

export type ExistingIngestionRequest = {
  requestId: string;
  status: IngestionStatus;
  clinicalRecordId: string | null;
  payloadHash: string;
};

export type CreateDraftArgs = {
  tenantId: string;
  patientId: string;
  idempotencyKey: string;
  requestId: string;
  payloadHash: string;
  payload: Record<string, unknown>;
};

export type CreateDraftResult = {
  clinicalRecordId: string;
  requestId: string;
  status: IngestionStatus;
  /** True if the row already existed (lost an idempotency-key race) — the
   *  unique (tenant_id, idempotency_key) constraint deduped it. */
  deduped: boolean;
};

/** The persistence seam. Real impl: store.ts (Drizzle, service_role). */
export interface IngestionStore {
  /** tenant_id for an existing, non-deleted patient, or null if unknown. */
  resolvePatientTenant(patientId: string): Promise<string | null>;
  /** Existing ingestion row for (tenant, idempotency_key), or null. */
  findRequest(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<ExistingIngestionRequest | null>;
  /** Create the draft clinical_record + ingestion row in one transaction. */
  createDraftWithRequest(args: CreateDraftArgs): Promise<CreateDraftResult>;
}

export type IngestionOutcome =
  | { kind: "created"; requestId: string; status: IngestionStatus; clinicalRecordId: string }
  | { kind: "replayed"; requestId: string; status: IngestionStatus; clinicalRecordId: string | null }
  | { kind: "unknown_patient" }
  | { kind: "conflict" }; // same idempotency_key, different payload

/** SHA-256 (hex) of the raw request body — stored for replay/mismatch detection. */
export function hashPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Parse and minimally validate the ingestion envelope. This validates only the
 * TRANSPORT shape (ids + idempotency key), never the clinical fields. Returns
 * null on a malformed envelope → the route answers 400. Unknown patient is NOT
 * decided here (that needs the DB) → it surfaces as a 422 from ingest().
 */
export function parseEnvelope(body: unknown): IngestionEnvelope | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  // Accept the external partner's snake_case wire keys.
  const idempotencyKey = b.idempotency_key;
  const requestId = b.request_id;
  const patientId = b.patient_id;
  const payload = b.payload;

  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) return null;
  if (typeof requestId !== "string" || requestId.length === 0) return null;
  if (typeof patientId !== "string" || !UUID_RE.test(patientId)) return null;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }

  return {
    idempotencyKey,
    requestId,
    patientId,
    payload: payload as Record<string, unknown>,
  };
}

/**
 * Ingest one verified request. Caller has already checked the HMAC signature.
 *
 * Flow:
 *  1. Resolve tenant_id from the patient (never the payload). Unknown → 422.
 *  2. Idempotency: if a row exists for (tenant, idempotency_key), replay its
 *     stored request_id + status. Same key with a DIFFERENT payload → conflict.
 *  3. Otherwise create the draft clinical_record + ingestion row atomically.
 *     The unique constraint is the real idempotency guarantee — a row that loses
 *     the insert race comes back as `deduped` and is reported as a replay.
 */
export async function ingest(
  envelope: IngestionEnvelope,
  payloadHash: string,
  store: IngestionStore,
): Promise<IngestionOutcome> {
  const tenantId = await store.resolvePatientTenant(envelope.patientId);
  if (!tenantId) return { kind: "unknown_patient" };

  const existing = await store.findRequest(tenantId, envelope.idempotencyKey);
  if (existing) {
    if (existing.payloadHash !== payloadHash) return { kind: "conflict" };
    return {
      kind: "replayed",
      requestId: existing.requestId,
      status: existing.status,
      clinicalRecordId: existing.clinicalRecordId,
    };
  }

  const created = await store.createDraftWithRequest({
    tenantId,
    patientId: envelope.patientId,
    idempotencyKey: envelope.idempotencyKey,
    requestId: envelope.requestId,
    payloadHash,
    payload: envelope.payload,
  });

  // A successful create means a draft exists → the request reaches `accepted`,
  // the review-queue state. Validated against the state machine.
  const expectedStatus = resolveOutcomeStatus(true);
  if (created.status !== expectedStatus) {
    throw new Error(
      `ingestion: store returned status ${created.status}, expected ${expectedStatus}`,
    );
  }

  if (created.deduped) {
    return {
      kind: "replayed",
      requestId: created.requestId,
      status: created.status,
      clinicalRecordId: created.clinicalRecordId,
    };
  }
  return {
    kind: "created",
    requestId: created.requestId,
    status: created.status,
    clinicalRecordId: created.clinicalRecordId,
  };
}
