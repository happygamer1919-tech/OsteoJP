/**
 * ficha-medica-compat.test.ts — W5-13 HEADLINE compatibility test.
 *
 * Proves the SPEC-ficha-medica.md sec 2 hard constraint: a `template = osteopathy`
 * ingestion payload carrying the TWELVE fixed clinical field keys lands a correct
 * draft (status='draft', ai_review_state='pending_review') with EACH of the twelve
 * values reachable in the Ficha Médica field it belongs to — no key silently
 * dropped, ZERO change on the external (André's Make.com) side.
 *
 * The mapping is IDENTITY: Ficha Médica is the `osteopathy` template evolved to a
 * new version with the twelve keys unchanged (W5-13 key-identity decision,
 * apps/web/lib/clinical/ficha-medica.ts). So the outbound `template=osteopathy`
 * selector (M1_TEMPLATE) and the twelve inbound keys resolve into Ficha Médica
 * with no server-side translation.
 *
 * Path exercised: the SAME real route + envelope + HMAC + ingest core as
 * ingestion-e2e.test.ts, with the store faked at the IO boundary (store.ts imports
 * "server-only" + the service_role DB the node runner cannot load). The fake
 * mirrors store.ts's documented write verbatim: status=draft,
 * ai_review_state=pending_review, raw payload under data._aiIngestionRaw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIngestionBody } from "@/lib/ingestion/hmac";
import {
  FICHA_MEDICA_AI_KEYS,
  FICHA_MEDICA_KEY,
  readFichaKeyPath,
} from "@/lib/clinical/ficha-medica";

// The frozen outbound ingestion selector. Its value is M1_TEMPLATE
// (apps/web/lib/consultation/m1-webhook.ts, "osteopathy"), inlined here because
// that module is "server-only" and cannot load in this test environment. The
// identity assertion below (FICHA_MEDICA_KEY === M1_SELECTOR) is what proves the
// selector and the Ficha Médica key are the same — no server-side translation.
const M1_SELECTOR = "osteopathy";

// ---------------------------------------------------------------------------
// In-memory store standing in for store.ts (service_role), mirroring its writes.
// ---------------------------------------------------------------------------
type StoredRecord = {
  id: string;
  tenantId: string;
  patientId: string;
  source: "manual" | "ai_ingested";
  status: "draft" | "locked" | "signed";
  aiReviewState: "pending_review" | "in_review" | "approved" | "rejected" | null;
  aiPayloadId: string | null;
  data: Record<string, unknown>;
};

const db = vi.hoisted(() => {
  const patients = new Map<string, { tenantId: string; deletedAt: Date | null }>();
  const requests = new Map<
    string,
    { requestId: string; status: "accepted"; clinicalRecordId: string; payloadHash: string }
  >();
  const records = new Map<string, StoredRecord>();
  let seq = 0;
  const key = (tenantId: string, idem: string) => `${tenantId}:${idem}`;

  return {
    patients,
    records,
    seedPatient(patientId: string, tenantId: string) {
      patients.set(patientId, { tenantId, deletedAt: null });
    },
    reset() {
      patients.clear();
      requests.clear();
      records.clear();
      seq = 0;
    },
    store: {
      async resolvePatientTenant(patientId: string): Promise<string | null> {
        const p = patients.get(patientId);
        if (!p || p.deletedAt) return null;
        return p.tenantId;
      },
      async findRequest(tenantId: string, idempotencyKey: string) {
        return requests.get(key(tenantId, idempotencyKey)) ?? null;
      },
      async createDraftWithRequest(args: {
        tenantId: string;
        patientId: string;
        idempotencyKey: string;
        requestId: string;
        payloadHash: string;
        payload: Record<string, unknown>;
      }) {
        const id = `rec-${++seq}`;
        // Mirrors store.ts verbatim (rule #4 + the _aiIngestionRaw contract).
        records.set(id, {
          id,
          tenantId: args.tenantId,
          patientId: args.patientId,
          source: "ai_ingested",
          status: "draft",
          aiReviewState: "pending_review",
          aiPayloadId: args.requestId,
          data: { _aiIngestionRaw: args.payload },
        });
        requests.set(key(args.tenantId, args.idempotencyKey), {
          requestId: args.requestId,
          status: "accepted",
          clinicalRecordId: id,
          payloadHash: args.payloadHash,
        });
        return { clinicalRecordId: id, requestId: args.requestId, status: "accepted" as const, deduped: false };
      },
    },
  };
});

vi.mock("@/lib/ingestion/store", () => ({ drizzleIngestionStore: db.store }));

// Imported AFTER the mock is registered (vi.mock is hoisted above imports).
import { POST } from "@/app/api/v1/ingestion/clinical-records/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SECRET = "test-only-ingestion-secret-ficha-compat";
const PATIENT_ID = "33333333-3333-3333-3333-333333333333";
const PATIENT_TENANT = "44444444-4444-4444-4444-444444444444";
const ENDPOINT = "https://app.osteojp.pt/api/v1/ingestion/clinical-records";

/**
 * A `template = osteopathy` payload carrying EXACTLY the twelve Ficha Médica AI
 * keys with distinct sentinel values, so each mapped value is individually
 * assertable. `template` is fixed to M1_TEMPLATE (the frozen outbound selector).
 * The nested systems_review.* leaves use the same dotted paths the external
 * pipeline sends — unchanged from osteopathy v2.
 */
const TWELVE_KEY_PAYLOAD = {
  template: M1_SELECTOR, // "osteopathy" — frozen, external side unchanged
  consultation_reason: "VAL_consultation_reason",
  relief_aggravation: "VAL_relief_aggravation",
  clinical_history: "VAL_clinical_history",
  systems_review: {
    neurological: "VAL_neurological",
    cardiovascular: "VAL_cardiovascular",
    respiratory: "VAL_respiratory",
    gastrointestinal: "VAL_gastrointestinal",
    urological_gynecological: "VAL_urological_gynecological",
    endocrine: "VAL_endocrine",
  },
  treatment_objectives: "VAL_treatment_objectives",
  treatment_plan: "VAL_treatment_plan",
  observations: "VAL_observations",
} as const;

/** The value we seeded for each dotted key path (mirrors TWELVE_KEY_PAYLOAD). */
function expectedValueFor(path: string): string {
  const leaf = path.split(".").at(-1)!;
  return `VAL_${leaf}`;
}

function envelopeBody(payload: Record<string, unknown>): string {
  return JSON.stringify({
    idempotency_key: "idem-ficha-compat-1",
    request_id: "partner-req-ficha-compat-1",
    patient_id: PATIENT_ID,
    payload,
  });
}

function signedRequest(rawBody: string): Request {
  const ts = Math.floor(Date.now() / 1000);
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-osteojp-timestamp": String(ts),
      "x-osteojp-signature": signIngestionBody(rawBody, ts, SECRET),
    },
    body: rawBody,
  });
}

let savedSecret: string | undefined;
beforeEach(() => {
  savedSecret = process.env.AI_INGESTION_HMAC_SECRET;
  process.env.AI_INGESTION_HMAC_SECRET = SECRET;
  db.reset();
  db.seedPatient(PATIENT_ID, PATIENT_TENANT);
});
afterEach(() => {
  if (savedSecret === undefined) delete process.env.AI_INGESTION_HMAC_SECRET;
  else process.env.AI_INGESTION_HMAC_SECRET = savedSecret;
});

describe("W5-13 — template=osteopathy twelve-key payload maps to Ficha Médica (identity)", () => {
  it("the outbound selector IS the Ficha Médica key (identity, no translation)", () => {
    // The compatibility constraint rests on this identity: if these ever diverge,
    // a server-side alias is required (SPEC sec 2 alternative). They must match.
    expect(FICHA_MEDICA_KEY).toBe(M1_SELECTOR);
    expect(M1_SELECTOR).toBe("osteopathy");
  });

  it("lands a correct draft with each of the twelve values reachable in its Ficha Médica field", async () => {
    const res = await POST(signedRequest(envelopeBody(TWELVE_KEY_PAYLOAD)));
    expect(res.status).toBe(201);

    const json = (await res.json()) as { clinical_record_id: string; status: string };
    expect(json.status).toBe("accepted");
    const recordId = json.clinical_record_id;
    expect(recordId).toBeTruthy();

    const rec = db.records.get(recordId)!;
    // Correct draft (SPEC sec 2 + rule #4): draft + pending_review, never finalized.
    expect(rec.status).toBe("draft");
    expect(rec.aiReviewState).toBe("pending_review");
    expect(["locked", "signed"]).not.toContain(rec.status);

    // The stored Ficha Médica payload (identity mapping = the raw payload lands
    // verbatim under the namespaced key the reviewer reads).
    const stored = rec.data._aiIngestionRaw as Record<string, unknown>;
    expect(stored.template).toBe("osteopathy");

    // Every one of the twelve keys is reachable under its Ficha Médica field
    // path with its exact value — NO key silently dropped.
    expect(FICHA_MEDICA_AI_KEYS).toHaveLength(12);
    for (const path of FICHA_MEDICA_AI_KEYS) {
      const landed = readFichaKeyPath(stored, path);
      expect(landed, `key "${path}" must land in its Ficha Médica field`).toBe(
        expectedValueFor(path),
      );
    }
  });

  it("drops none of the twelve keys — the reachable set equals the sent set", async () => {
    const res = await POST(signedRequest(envelopeBody(TWELVE_KEY_PAYLOAD)));
    const { clinical_record_id: recordId } = (await res.json()) as {
      clinical_record_id: string;
    };
    const stored = db.records.get(recordId)!.data._aiIngestionRaw as Record<string, unknown>;

    const reachable = FICHA_MEDICA_AI_KEYS.filter(
      (path) => readFichaKeyPath(stored, path) !== undefined,
    );
    expect(reachable).toEqual([...FICHA_MEDICA_AI_KEYS]);
  });
});
