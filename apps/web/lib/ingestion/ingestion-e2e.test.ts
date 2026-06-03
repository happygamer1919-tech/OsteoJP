/**
 * ingestion-e2e.test.ts — AI-partner ingestion END-TO-END harness (Stream D).
 *
 * Proves the full cycle against a SELF-SIGNED test payload, with no real partner
 * contract and no live DB:
 *
 *     sign(payload) ──HMAC──▶ POST /api/v1/ingestion/clinical-records
 *        → verifyIngestionSignature (real)      401 on a bad/absent signature
 *        → parseEnvelope (real)                 400 on a malformed body/envelope
 *        → ingest (real)                        tenant_id resolved from patient
 *        → store.createDraftWithRequest (FAKE)  lands as an ai_draft:
 *               record_status      = draft        (NOT locked/signed — rule #4)
 *               ai_review_state    = pending_review
 *        ── human review queue (real state machine) ──
 *        → claim     pending_review → in_review   ("under_review")
 *        → finalize  in_review      → approved     (therapist finalizes)
 *        → immutability: the approved review and the locked record both refuse
 *          further mutation.
 *
 * WHY A FAKE STORE: store.ts imports "server-only" + the Drizzle/service_role DB,
 * which the node runner cannot load. The in-memory DB below MIRRORS store.ts's
 * documented writes (status=draft, ai_review_state=pending_review, raw payload
 * under data._aiIngestionRaw) so the route runs for real end-to-end while the IO
 * boundary is faked — the same approach as the reminders e2e smoke test.
 *
 * PARTNER-GATED: the real partner field mapping is owed by Andrei and the signed
 * contract gates go-live. The clinical `payload` here is a DOCUMENTED PLACEHOLDER
 * (see PLACEHOLDER_PAYLOAD); the real-payload assertion is left as `it.todo`
 * pending that field list. Nothing here interprets payload fields — the draft
 * stores them verbatim for the human reviewer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIngestionBody, REPLAY_WINDOW_SECONDS } from "@/lib/ingestion/hmac";
import {
  assertReviewTransition,
  canReviewTransition,
  finalizeReview,
  isTerminalReviewState,
  INITIAL_REVIEW_STATE,
  type AiReviewState,
} from "@/lib/ingestion/review-state";

// ---------------------------------------------------------------------------
// In-memory DB standing in for store.ts (service_role). Built inside vi.hoisted
// so the store mock factory (hoisted above imports) can reference it. Method
// BODIES run at test time, so they may close over the review-state helpers
// imported above.
// ---------------------------------------------------------------------------
type StoredRecord = {
  id: string;
  tenantId: string;
  patientId: string;
  source: "manual" | "ai_ingested";
  status: "draft" | "locked" | "signed";
  aiReviewState: AiReviewState | null;
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
    seedPatient(patientId: string, tenantId: string, deletedAt: Date | null = null) {
      patients.set(patientId, { tenantId, deletedAt });
    },
    reset() {
      patients.clear();
      requests.clear();
      records.clear();
      seq = 0;
    },
    // --- IngestionStore seam (mirrors store.ts) ---
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
        // Mirrors store.ts: an AI draft is NEVER locked/signed and NEVER
        // approved on arrival (rule #4) — it lands for human review.
        records.set(id, {
          id,
          tenantId: args.tenantId, // explicit, from the resolved patient
          patientId: args.patientId,
          source: "ai_ingested",
          status: "draft",
          aiReviewState: INITIAL_REVIEW_STATE, // "pending_review"
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
    // --- review-queue + record ops the human side drives ---
    claimForReview(recordId: string) {
      const r = records.get(recordId);
      if (!r) throw new Error("no such record");
      assertReviewTransition(r.aiReviewState ?? INITIAL_REVIEW_STATE, "in_review");
      r.aiReviewState = "in_review";
    },
    finalize(recordId: string) {
      const r = records.get(recordId);
      if (!r) throw new Error("no such record");
      // Therapist finalizes: the review decision becomes approved (terminal).
      r.aiReviewState = finalizeReview(r.aiReviewState ?? INITIAL_REVIEW_STATE);
    },
    // Models the clinical_records immutability trigger (migration 0001) +
    // signAndLockRecord: a locked/signed record refuses edits.
    lockRecord(recordId: string) {
      const r = records.get(recordId);
      if (!r) throw new Error("no such record");
      if (r.status !== "draft") throw new Error("clinical_records: finalized and immutable");
      r.status = "locked";
    },
    updateData(recordId: string, data: Record<string, unknown>) {
      const r = records.get(recordId);
      if (!r) throw new Error("no such record");
      if (r.status !== "draft") throw new Error("clinical_records: finalized and immutable");
      r.data = data;
    },
  };
});

vi.mock("@/lib/ingestion/store", () => ({ drizzleIngestionStore: db.store }));

// Imported AFTER the mock is registered (vi.mock is hoisted above imports).
import { POST } from "@/app/api/v1/ingestion/clinical-records/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SECRET = "test-only-ingestion-secret-not-andrei";
const PATIENT_ID = "11111111-1111-1111-1111-111111111111";
const PATIENT_TENANT = "22222222-2222-2222-2222-222222222222";
const OTHER_TENANT = "99999999-9999-9999-9999-999999999999";
const ENDPOINT = "https://app.osteojp.pt/api/v1/ingestion/clinical-records";

/**
 * DOCUMENTED PLACEHOLDER clinical payload — a stand-in for the AI partner's real
 * field set, which is PENDING Andrei's mapping (store.ts TODO(andrei)). Keys are
 * illustrative only; nothing in the pipeline interprets them yet — the draft
 * stores the whole object verbatim under data._aiIngestionRaw. Shaped like a SOAP
 * osteopathy note so the harness exercises a realistic payload.
 */
const PLACEHOLDER_PAYLOAD = {
  schema_version: "placeholder-0",
  subjective: "Left shoulder pain, 3 weeks, worse on abduction.",
  objective: "Restricted glenohumeral abduction; tender supraspinatus insertion.",
  assessment: "Suspected supraspinatus tendinopathy.",
  plan: "Soft-tissue work; review in one week.",
  bodychart: { regions: ["left_shoulder"] },
} as const;

function envelopeBody(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    idempotency_key: "idem-e2e-1",
    request_id: "partner-req-e2e-1",
    patient_id: PATIENT_ID,
    payload: PLACEHOLDER_PAYLOAD,
    ...over,
  });
}

/** Build a request signed exactly like the partner would (HMAC over raw bytes). */
function signedRequest(rawBody: string, opts: { ts?: number; signature?: string } = {}): Request {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-osteojp-timestamp": String(ts),
      "x-osteojp-signature": opts.signature ?? signIngestionBody(rawBody, ts, SECRET),
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

// ===========================================================================
// 1. Full happy-path cycle: signed POST → ai_draft → under_review → finalized
// ===========================================================================
describe("full ingestion → review → finalize cycle", () => {
  it("accepts a correctly signed payload and lands it as an ai_draft (never finalized directly)", async () => {
    const res = await POST(signedRequest(envelopeBody()));
    expect(res.status).toBe(201);

    const json = (await res.json()) as Record<string, unknown>;
    expect(json.status).toBe("accepted"); // ingestion_status: in the review queue
    expect(json.idempotent).toBe(false);
    const recordId = json.clinical_record_id as string;
    expect(recordId).toBeTruthy();

    // The created clinical_record is an AI DRAFT awaiting review — rule #4: NOT
    // locked, NOT signed, NOT approved.
    const rec = db.records.get(recordId)!;
    expect(rec.source).toBe("ai_ingested");
    expect(rec.status).toBe("draft");
    expect(rec.aiReviewState).toBe("pending_review");
    expect(["locked", "signed"]).not.toContain(rec.status);
    // Payload stored verbatim for the human reviewer (no field interpretation yet).
    expect(rec.data._aiIngestionRaw).toEqual(PLACEHOLDER_PAYLOAD);
  });

  it("derives tenant_id from the patient, never from the payload", async () => {
    // Hostile payload tries to smuggle a different tenant id.
    const res = await POST(
      signedRequest(envelopeBody({ payload: { ...PLACEHOLDER_PAYLOAD, tenantId: OTHER_TENANT } })),
    );
    expect(res.status).toBe(201);
    const { clinical_record_id } = (await res.json()) as { clinical_record_id: string };
    const rec = db.records.get(clinical_record_id)!;
    expect(rec.tenantId).toBe(PATIENT_TENANT);
    expect(rec.tenantId).not.toBe(OTHER_TENANT);
  });

  it("runs the human review cycle: pending_review → in_review → approved (finalized)", async () => {
    const res = await POST(signedRequest(envelopeBody()));
    const { clinical_record_id: recordId } = (await res.json()) as { clinical_record_id: string };

    // ai_draft
    expect(db.records.get(recordId)!.aiReviewState).toBe("pending_review");

    // reviewer claims it → under_review
    db.claimForReview(recordId);
    expect(db.records.get(recordId)!.aiReviewState).toBe("in_review");

    // therapist finalizes → approved
    db.finalize(recordId);
    expect(db.records.get(recordId)!.aiReviewState).toBe("approved");
    expect(isTerminalReviewState("approved")).toBe(true);
  });

  it("is idempotent: replaying the same signed request returns the same draft, no duplicate", async () => {
    const body = envelopeBody();
    const first = await POST(signedRequest(body));
    expect(first.status).toBe(201);
    const a = (await first.json()) as { clinical_record_id: string };

    const second = await POST(signedRequest(body));
    expect(second.status).toBe(200); // replayed
    const b = (await second.json()) as { clinical_record_id: string; idempotent: boolean };

    expect(b.idempotent).toBe(true);
    expect(b.clinical_record_id).toBe(a.clinical_record_id);
    expect(db.records.size).toBe(1); // exactly one draft was ever created
  });
});

// ===========================================================================
// 2. Finalized immutability
// ===========================================================================
describe("finalized immutability", () => {
  async function ingestAndFinalize(): Promise<string> {
    const res = await POST(signedRequest(envelopeBody()));
    const { clinical_record_id: id } = (await res.json()) as { clinical_record_id: string };
    db.claimForReview(id);
    db.finalize(id);
    return id;
  }

  it("refuses to re-finalize an approved review (the decision is immutable)", async () => {
    const id = await ingestAndFinalize();
    expect(() => db.finalize(id)).toThrow(/illegal transition/);
    expect(canReviewTransition("approved", "in_review")).toBe(false);
  });

  it("refuses edits and re-locking once the record is locked (DB-trigger invariant)", async () => {
    const id = await ingestAndFinalize();
    db.lockRecord(id); // therapist completes the standard lifecycle: draft → locked
    expect(() => db.updateData(id, { tampered: true })).toThrow(/finalized and immutable/);
    expect(() => db.lockRecord(id)).toThrow(/finalized and immutable/);
  });
});

// ===========================================================================
// 3. Rejection branches — bad signature, malformed payload, bad envelope
// ===========================================================================
describe("rejection branches", () => {
  it("401s on a missing signature (HMAC is the only gate, no session)", async () => {
    const res = await POST(new Request(ENDPOINT, { method: "POST", body: envelopeBody() }));
    expect(res.status).toBe(401);
    expect(db.records.size).toBe(0); // never reached the store
  });

  it("401s on a wrong signature", async () => {
    const res = await POST(signedRequest(envelopeBody(), { signature: "deadbeef" }));
    expect(res.status).toBe(401);
    expect(db.records.size).toBe(0);
  });

  it("401s on a tampered body (signature no longer matches the bytes)", async () => {
    // Sign the original, then send a different body under that signature.
    const ts = Math.floor(Date.now() / 1000);
    const signature = signIngestionBody(envelopeBody(), ts, SECRET);
    const tampered = envelopeBody({ request_id: "swapped-after-signing" });
    const res = await POST(signedRequest(tampered, { ts, signature }));
    expect(res.status).toBe(401);
    expect(db.records.size).toBe(0);
  });

  it("401s on a stale timestamp outside the replay window", async () => {
    const staleTs = Math.floor(Date.now() / 1000) - (REPLAY_WINDOW_SECONDS + 60);
    const body = envelopeBody();
    const res = await POST(signedRequest(body, { ts: staleTs }));
    expect(res.status).toBe(401);
    expect(db.records.size).toBe(0);
  });

  it("400s on a malformed (non-JSON) body that is correctly signed", async () => {
    const res = await POST(signedRequest("this is not json"));
    const json = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("malformed_body");
    expect(db.records.size).toBe(0);
  });

  it("400s on a correctly signed body whose envelope is missing required fields", async () => {
    // Valid JSON, valid signature, but no idempotency_key/request_id/patient_id.
    const res = await POST(signedRequest(JSON.stringify({ payload: PLACEHOLDER_PAYLOAD })));
    const json = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_envelope");
    expect(db.records.size).toBe(0);
  });

  it("422s when the patient cannot be resolved (signed + well-formed, unknown patient)", async () => {
    db.reset(); // no patient seeded
    const res = await POST(signedRequest(envelopeBody()));
    expect(res.status).toBe(422);
    expect(db.records.size).toBe(0);
  });
});

// ===========================================================================
// 4. Illegal review transitions (state-machine guardrails on the human side)
// ===========================================================================
describe("review state-machine guardrails", () => {
  it("forbids finalizing a draft that was never claimed for review", async () => {
    const res = await POST(signedRequest(envelopeBody()));
    const { clinical_record_id: id } = (await res.json()) as { clinical_record_id: string };
    // pending_review → approved is illegal: review is required before finalize.
    expect(() => db.finalize(id)).toThrow(/illegal transition/);
    expect(db.records.get(id)!.aiReviewState).toBe("pending_review");
  });
});

// ===========================================================================
// 5. PARTNER-GATED — real payload, pending Andrei's field mapping
// ===========================================================================
// The transport (envelope + HMAC + dedupe + review cycle) is proven above
// against PLACEHOLDER_PAYLOAD. The REAL clinical field set, its per-field
// validation, and the bodychart region→marker mapping are owed by Andrei and
// gate go-live; until the signed contract lands there is nothing concrete to
// assert. Keep this as an explicit pending marker, not a silent gap.
describe("real partner payload", () => {
  it.todo("validates the real AI partner field set — PENDING Andrei's field mapping + signed contract");
});
