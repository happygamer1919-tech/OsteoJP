import { NextResponse } from "next/server";
import { verifyIngestionSignature } from "@/lib/ingestion/hmac";
import { hashPayload, ingest, parseEnvelope } from "@/lib/ingestion/ingest";
import { drizzleIngestionStore } from "@/lib/ingestion/store";

// AI partner ingestion endpoint (Stream D — SHELL).
//
// POST /api/v1/ingestion/clinical-records
//
// Server-to-server, authenticated by an HMAC signature over the RAW body (see
// lib/ingestion/hmac.ts) — NOT by a Supabase session. The handler:
//   1. verifies the signature + replay window           -> 401 on any failure
//   2. parses the transport envelope                    -> 400 if malformed
//   3. resolves tenant_id from the patient (never the payload)
//   4. dedupes on (tenant_id, idempotency_key)          -> replay, no duplicate
//   5. creates a DRAFT clinical_record (source=ai_ingested, unlocked) + the
//      ai_ingestion_requests row, as service_role, tenant_id set explicitly.
//
// OUT OF SCOPE (TODO andrei): per-field payload validation and bodychart
// region→marker mapping — both wait on the partner field list. The draft stores
// the raw payload verbatim for the human reviewer (see store.ts).
//
// TODO(hardening-lane): exclude this path from the Supabase session middleware
// (apps/web/middleware.ts, owned by the hardening lane) — same as /api/inngest.
// This route is HMAC-authed; the session middleware would otherwise redirect the
// partner's unauthenticated server call to login. Do NOT edit that file here.

export const runtime = "nodejs"; // node:crypto + server-only
export const dynamic = "force-dynamic"; // signed, per-request; never cached

export async function POST(req: Request): Promise<Response> {
  // Raw bytes first — the HMAC is over exactly what was sent, before any parse.
  const rawBody = await req.text();

  let verified: ReturnType<typeof verifyIngestionSignature>;
  try {
    verified = verifyIngestionSignature(rawBody, req.headers);
  } catch {
    // Fail-loud secret misconfiguration (no PII to leak). Generic 500.
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  if (!verified.ok) {
    // Never echo WHICH check failed.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed_body" }, { status: 400 });
  }

  const envelope = parseEnvelope(parsed);
  if (!envelope) {
    return NextResponse.json({ error: "invalid_envelope" }, { status: 400 });
  }

  const payloadHash = hashPayload(rawBody);

  let outcome: Awaited<ReturnType<typeof ingest>>;
  try {
    outcome = await ingest(envelope, payloadHash, drizzleIngestionStore);
  } catch {
    // Never surface DB internals or payload content.
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  switch (outcome.kind) {
    case "unknown_patient":
      return NextResponse.json({ error: "unknown_patient" }, { status: 422 });
    case "conflict":
      // Same idempotency_key reused with a different payload.
      return NextResponse.json({ error: "idempotency_key_conflict" }, { status: 409 });
    case "replayed":
      return NextResponse.json(
        {
          request_id: outcome.requestId,
          status: outcome.status,
          clinical_record_id: outcome.clinicalRecordId,
          idempotent: true,
        },
        { status: 200 },
      );
    case "created":
      return NextResponse.json(
        {
          request_id: outcome.requestId,
          status: outcome.status,
          clinical_record_id: outcome.clinicalRecordId,
          idempotent: false,
        },
        { status: 201 },
      );
  }
}
