import { describe, expect, it } from "vitest";
import {
  hashPayload,
  ingest,
  parseEnvelope,
  type CreateDraftArgs,
  type CreateDraftResult,
  type ExistingIngestionRequest,
  type IngestionEnvelope,
  type IngestionStore,
} from "./ingest";

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_TENANT = "22222222-2222-2222-2222-222222222222";

// In-memory store. Records the args passed to createDraftWithRequest so tests
// can assert tenant_id provenance, and lets us seed an existing row for replay.
function makeStore(opts: {
  patientTenant?: string | null;
  existing?: ExistingIngestionRequest | null;
}): IngestionStore & { created: CreateDraftArgs[] } {
  const created: CreateDraftArgs[] = [];
  return {
    created,
    async resolvePatientTenant() {
      return opts.patientTenant === undefined ? PATIENT_TENANT : opts.patientTenant;
    },
    async findRequest() {
      return opts.existing ?? null;
    },
    async createDraftWithRequest(args: CreateDraftArgs): Promise<CreateDraftResult> {
      created.push(args);
      return {
        clinicalRecordId: "rec-new",
        requestId: args.requestId,
        status: "accepted",
        deduped: false,
      };
    },
  };
}

function envelope(over: Partial<IngestionEnvelope> = {}): IngestionEnvelope {
  return {
    idempotencyKey: "idem-1",
    requestId: "partner-req-1",
    patientId: PATIENT_ID,
    payload: { note: "shoulder pain" },
    ...over,
  };
}

describe("parseEnvelope", () => {
  it("parses snake_case wire keys", () => {
    const env = parseEnvelope({
      idempotency_key: "k",
      request_id: "r",
      patient_id: PATIENT_ID,
      payload: { a: 1 },
    });
    expect(env).toEqual({
      idempotencyKey: "k",
      requestId: "r",
      patientId: PATIENT_ID,
      payload: { a: 1 },
    });
  });

  it("rejects malformed envelopes", () => {
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope({ request_id: "r", patient_id: PATIENT_ID, payload: {} })).toBeNull();
    expect(parseEnvelope({ idempotency_key: "k", patient_id: PATIENT_ID, payload: {} })).toBeNull();
    expect(
      parseEnvelope({ idempotency_key: "k", request_id: "r", patient_id: "not-a-uuid", payload: {} }),
    ).toBeNull();
    expect(
      parseEnvelope({ idempotency_key: "k", request_id: "r", patient_id: PATIENT_ID, payload: [] }),
    ).toBeNull();
  });
});

describe("ingest", () => {
  it("returns unknown_patient (422 path) when the patient cannot be resolved", async () => {
    const store = makeStore({ patientTenant: null });
    const out = await ingest(envelope(), hashPayload("{}"), store);
    expect(out).toEqual({ kind: "unknown_patient" });
    expect(store.created).toHaveLength(0);
  });

  it("creates a draft and reaches the accepted (review-queue) status", async () => {
    const store = makeStore({});
    const out = await ingest(envelope(), hashPayload("{}"), store);
    expect(out).toEqual({
      kind: "created",
      requestId: "partner-req-1",
      status: "accepted",
      clinicalRecordId: "rec-new",
    });
  });

  it("derives tenant_id from the patient, NOT from the payload", async () => {
    const store = makeStore({});
    // A hostile payload trying to smuggle a tenant id must be ignored.
    const env = envelope({
      payload: { tenantId: "99999999-9999-9999-9999-999999999999", note: "x" },
    });
    await ingest(env, hashPayload("{}"), store);
    expect(store.created).toHaveLength(1);
    expect(store.created[0].tenantId).toBe(PATIENT_TENANT);
    expect(store.created[0].tenantId).not.toBe("99999999-9999-9999-9999-999999999999");
  });

  it("replays an existing row (same request_id + status), no duplicate", async () => {
    const hash = hashPayload(JSON.stringify({ note: "shoulder pain" }));
    const store = makeStore({
      existing: {
        requestId: "partner-req-1",
        status: "accepted",
        clinicalRecordId: "rec-existing",
        payloadHash: hash,
      },
    });
    const out = await ingest(envelope(), hash, store);
    expect(out).toEqual({
      kind: "replayed",
      requestId: "partner-req-1",
      status: "accepted",
      clinicalRecordId: "rec-existing",
    });
    expect(store.created).toHaveLength(0); // never writes a duplicate
  });

  it("conflicts (409 path) when the same idempotency_key arrives with a different payload", async () => {
    const store = makeStore({
      existing: {
        requestId: "partner-req-1",
        status: "accepted",
        clinicalRecordId: "rec-existing",
        payloadHash: "hash-of-original-payload",
      },
    });
    const out = await ingest(envelope(), "hash-of-DIFFERENT-payload", store);
    expect(out).toEqual({ kind: "conflict" });
    expect(store.created).toHaveLength(0);
  });

  it("reports a deduped create (lost idempotency race) as a replay", async () => {
    const store: IngestionStore = {
      async resolvePatientTenant() {
        return PATIENT_TENANT;
      },
      async findRequest() {
        return null; // nothing on the pre-check...
      },
      async createDraftWithRequest(args) {
        // ...but the unique constraint deduped us on insert.
        return {
          clinicalRecordId: "rec-winner",
          requestId: args.requestId,
          status: "accepted",
          deduped: true,
        };
      },
    };
    const out = await ingest(envelope(), hashPayload("{}"), store);
    expect(out).toEqual({
      kind: "replayed",
      requestId: "partner-req-1",
      status: "accepted",
      clinicalRecordId: "rec-winner",
    });
  });
});
