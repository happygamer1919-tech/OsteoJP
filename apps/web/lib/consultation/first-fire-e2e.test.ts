import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { INITIAL_REVIEW_STATE, type AiReviewState } from "@/lib/ingestion/review-state";

// W4-10 — first end-to-end test fire (machine half), fully local (no AWS/M1 key,
// no André). It ties the two ends of the recording pipeline the earlier loops
// built:
//   (A) the OUTBOUND M1 webhook fire (W4-09) carries the full contract with
//       `x-make-apikey` (from env, in the header) and `audio_filename` — the two
//       things André's module-26 remap needs;
//   (B) simulating André's post-back, an HMAC-signed ingestion POST lands a
//       `pending_review` draft via the EXISTING ingestion endpoint (CLAUDE.md
//       rule 4 — never locked/signed directly).
// The idempotency key (patient_id + consultation_started_at + consultation_ended_at,
// SPEC §8) links the fire to the ingestion. The REAL deployed fire (real bucket +
// M1 key + André's confirmation) is AWAITING-EXTERNAL — see the mailbox note.

// --- in-memory ingestion store (stands in for store.ts / service_role) ---
const db = vi.hoisted(() => {
  interface Rec {
    id: string;
    tenantId: string;
    patientId: string;
    status: string;
    aiReviewState: AiReviewState | null;
    source: string;
  }
  const records = new Map<string, Rec>();
  const requests = new Map<string, { tenantId: string; idempotencyKey: string; requestId: string; payloadHash: string; recordId: string }>();
  const patients = new Map<string, string>(); // patientId -> tenantId
  let seq = 0;
  return {
    records,
    reset() {
      records.clear();
      requests.clear();
      patients.clear();
      seq = 0;
    },
    seedPatient(patientId: string, tenantId: string) {
      patients.set(patientId, tenantId);
    },
    store: {
      async resolvePatientTenant(patientId: string) {
        return patients.get(patientId) ?? null;
      },
      async findRequest(tenantId: string, idempotencyKey: string) {
        const r = requests.get(`${tenantId}:${idempotencyKey}`);
        if (!r) return null;
        return { requestId: r.requestId, payloadHash: r.payloadHash, status: "accepted", clinicalRecordId: r.recordId };
      },
      async createDraftWithRequest(args: {
        tenantId: string;
        patientId: string;
        idempotencyKey: string;
        requestId: string;
        payloadHash: string;
        payload: unknown;
      }) {
        const id = `rec-${++seq}`;
        // Mirrors store.ts: an AI draft is NEVER locked/signed and enters the
        // review queue as pending_review.
        records.set(id, {
          id,
          tenantId: args.tenantId,
          patientId: args.patientId,
          status: "draft",
          aiReviewState: INITIAL_REVIEW_STATE, // "pending_review"
          source: "ai_ingested",
        });
        requests.set(`${args.tenantId}:${args.idempotencyKey}`, {
          tenantId: args.tenantId,
          idempotencyKey: args.idempotencyKey,
          requestId: args.requestId,
          payloadHash: args.payloadHash,
          recordId: id,
        });
        return { clinicalRecordId: id, requestId: args.requestId, status: "accepted" as const };
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ingestion/store", () => ({ drizzleIngestionStore: db.store }));

import { POST } from "@/app/api/v1/ingestion/clinical-records/route";
import { signIngestionBody } from "@/lib/ingestion/hmac";
import { buildM1Payload, fireM1Webhook } from "@/lib/consultation/m1-webhook";

const HMAC_SECRET = "test-only-ingestion-secret-not-andrei";
// Synthetic quick-created patient (W4-06). Real therapist id as doctor_id
// (READ-ONLY — the pipeline references it, never writes the therapist row).
const SYNTHETIC_PATIENT = "aaaa1111-2222-3333-4444-555566667777";
const SYNTHETIC_TENANT = "bbbb1111-2222-3333-4444-555566667777";
const REAL_THERAPIST_DOCTOR_ID = "cccc1111-2222-3333-4444-555566667777";
const STARTED = "2026-07-07T09:00:00.000Z";
const ENDED = "2026-07-07T09:42:00.000Z";
// Idempotency key = patient_id + both machine timestamps (SPEC §8).
const IDEMPOTENCY_KEY = `${SYNTHETIC_PATIENT}:${STARTED}:${ENDED}`;

beforeEach(() => {
  process.env.AI_INGESTION_HMAC_SECRET = HMAC_SECRET;
  process.env.M1_WEBHOOK_URL = "https://hook.make.test/osteojp";
  process.env.M1_WEBHOOK_API_KEY = "vault-webhook-secret-value";
  db.reset();
  db.seedPatient(SYNTHETIC_PATIENT, SYNTHETIC_TENANT);
});
afterEach(() => {
  delete process.env.AI_INGESTION_HMAC_SECRET;
  delete process.env.M1_WEBHOOK_URL;
  delete process.env.M1_WEBHOOK_API_KEY;
});

describe("W4-10 first fire — (A) outbound M1 webhook carries the full contract", () => {
  it("payload has every mandatory field incl. audio_filename; x-make-apikey is in the header, never the body", async () => {
    const payload = buildM1Payload({
      audioUrl: "https://osteojp-audio-intake.s3.eu-central-1.amazonaws.com/t/p/ts/consultation.webm?X-Amz-Signature=TRUNCATED",
      audioFilename: "consultation.webm",
      patientId: SYNTHETIC_PATIENT,
      doctorId: REAL_THERAPIST_DOCTOR_ID,
      consultationStartedAt: STARTED,
      consultationEndedAt: ENDED,
    });
    // All mandatory contract fields present (SPEC §7).
    expect(payload).toMatchObject({
      audio_filename: "consultation.webm",
      patient_id: SYNTHETIC_PATIENT,
      doctor_id: REAL_THERAPIST_DOCTOR_ID,
      consultation_started_at: STARTED,
      consultation_ended_at: ENDED,
      template: "osteopathy",
    });
    expect(payload.audio_url).toContain("consultation.webm");

    const seen: { headers: Record<string, string>; body: string } = { headers: {}, body: "" };
    const fakeFetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      seen.headers = init!.headers as Record<string, string>;
      seen.body = String(init!.body);
      return { ok: true, status: 200 } as Response;
    });
    const r = await fireM1Webhook(payload, fakeFetch as unknown as typeof fetch);

    expect(r).toEqual({ ok: true, status: 200 });
    expect(seen.headers["x-make-apikey"]).toBe("vault-webhook-secret-value"); // in the header
    expect(seen.body).not.toContain("vault-webhook-secret-value"); // never in the body
    expect(JSON.parse(seen.body).audio_filename).toBe("consultation.webm"); // André's mappable token
  });
});

describe("W4-10 first fire — (B) inbound: HMAC ingestion lands a pending_review draft", () => {
  function signedIngest(rawBody: string): Request {
    const ts = Math.floor(Date.now() / 1000); // within the HMAC replay window
    return new Request("https://app.osteojp.pt/api/v1/ingestion/clinical-records", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-osteojp-timestamp": String(ts),
        "x-osteojp-signature": signIngestionBody(rawBody, ts, HMAC_SECRET),
      },
      body: rawBody,
    });
  }

  it("a signed post-back for the synthetic patient lands as pending_review (never locked/signed)", async () => {
    const body = JSON.stringify({
      idempotency_key: IDEMPOTENCY_KEY,
      request_id: "andre-first-fire-req",
      patient_id: SYNTHETIC_PATIENT,
      payload: { schema_version: "placeholder-0", subjective: "…", objective: "…", assessment: "…", plan: "…" },
    });
    const res = await POST(signedIngest(body));
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    const recordId = json.clinical_record_id as string;
    expect(recordId).toBeTruthy();

    // Machine DoD: the draft is in the review queue as pending_review, not signed.
    const rec = db.records.get(recordId)!;
    expect(rec.aiReviewState).toBe("pending_review");
    expect(rec.status).toBe("draft");
    expect(rec.source).toBe("ai_ingested");
    expect(rec.tenantId).toBe(SYNTHETIC_TENANT); // tenant resolved from the patient, not the payload
  });
});
