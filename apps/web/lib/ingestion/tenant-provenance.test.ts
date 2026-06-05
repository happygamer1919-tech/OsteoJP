import { describe, expect, it } from "vitest";
import {
  hashPayload,
  ingest,
  parseEnvelope,
  type CreateDraftArgs,
  type CreateDraftResult,
  type IngestionEnvelope,
  type IngestionStore,
} from "./ingest";

/**
 * Adversarial audit — the ONE sanctioned cross-tenant writer (AI ingestion).
 *
 * The ingestion endpoint runs as service_role (BYPASSRLS), so the DB cannot be
 * the tenant wall here (proven separately: ai-ingestion-rls-isolation.test.ts).
 * The wall is the orchestration contract in ingest.ts: tenant_id is resolved
 * from the PATIENT row and set explicitly — never read from attacker-controlled
 * request data. These tests attack that contract: a forged tenant in the
 * payload (or the raw body) must never become the row's tenant_id.
 */

const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_TENANT = "22222222-2222-2222-2222-222222222222";
const ATTACKER_TENANT = "33333333-3333-3333-3333-333333333333";

// In-memory store that records the args handed to createDraftWithRequest, so we
// can assert exactly which tenant_id the writer persisted and where it came from.
function makeStore(patientTenant: string | null): IngestionStore & {
  created: CreateDraftArgs[];
} {
  const created: CreateDraftArgs[] = [];
  return {
    created,
    async resolvePatientTenant() {
      return patientTenant;
    },
    async findRequest() {
      return null;
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

function envelope(payload: Record<string, unknown>): IngestionEnvelope {
  return {
    idempotencyKey: "idem-1",
    requestId: "partner-req-1",
    patientId: PATIENT_ID,
    payload,
  };
}

describe("AI ingestion — tenant_id provenance (sanctioned service_role writer)", () => {
  it("derives tenant_id from the resolved patient, not the payload", async () => {
    const store = makeStore(PATIENT_TENANT);
    const env = envelope({ note: "shoulder pain" });

    const outcome = await ingest(env, hashPayload("body"), store);

    expect(outcome.kind).toBe("created");
    expect(store.created).toHaveLength(1);
    expect(store.created[0]?.tenantId).toBe(PATIENT_TENANT);
  });

  it("ignores a forged tenant in the payload — writes the patient's tenant", async () => {
    const store = makeStore(PATIENT_TENANT);
    // Attacker stuffs every plausible tenant key into the clinical payload.
    const env = envelope({
      tenant_id: ATTACKER_TENANT,
      tenantId: ATTACKER_TENANT,
      tenant: ATTACKER_TENANT,
      note: "shoulder pain",
    });

    await ingest(env, hashPayload("body"), store);

    const args = store.created[0];
    expect(args?.tenantId).toBe(PATIENT_TENANT);
    expect(args?.tenantId).not.toBe(ATTACKER_TENANT);
    // The forged values ride along only as opaque clinical content (the store
    // persists them under a namespaced raw key); they never set tenant_id.
    expect(args?.payload).toMatchObject({ tenant_id: ATTACKER_TENANT });
  });

  it("parseEnvelope has no tenant field — a top-level tenant_id in the body is dropped", () => {
    const env = parseEnvelope({
      idempotency_key: "k",
      request_id: "r",
      patient_id: PATIENT_ID,
      tenant_id: ATTACKER_TENANT, // attacker-supplied at the envelope level
      payload: { a: 1 },
    });

    expect(env).not.toBeNull();
    // The envelope type carries no tenant field, so the forged value cannot
    // enter the pipeline through transport parsing.
    expect(env as object).not.toHaveProperty("tenant");
    expect(env as object).not.toHaveProperty("tenantId");
    expect(env as object).not.toHaveProperty("tenant_id");
    expect(env?.payload).toEqual({ a: 1 });
  });

  it("unknown patient → no write at all (tenant cannot be conjured)", async () => {
    const store = makeStore(null); // resolvePatientTenant returns null
    const outcome = await ingest(envelope({ note: "x" }), hashPayload("body"), store);

    expect(outcome.kind).toBe("unknown_patient");
    expect(store.created).toHaveLength(0);
  });
});
