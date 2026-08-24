import { NextResponse } from "next/server";
import {
  RULES,
  checkRateLimit,
  clientKey,
  tooManyRequests,
} from "@osteojp/rate-limit";
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
// Session middleware: `/api/v1/ingestion` is excluded from the Supabase session
// proxy (apps/web/proxy.ts matcher, same as /api/inngest), so this unauthenticated
// server-to-server request reaches the handler instead of being redirected to
// /login. The HMAC check below is the ONLY auth gate.
//
// ===========================================================================
// RATE LIMITED SINCE SEC-web-surface-limiter-adoption ROUTE 3.
// ===========================================================================
// SAY WHAT IT BUYS, BECAUSE IT IS LESS THAN IT LOOKS. The gate here is an HMAC
// over the raw body. An attacker without AI_INGESTION_HMAC_SECRET cannot
// produce a valid signature at any rate, so NO number in RULES changes what is
// reachable. What the limit bounds is COST: the body read and the HMAC an
// unauthenticated caller can force us to perform, over and over, for free.
//
// IT IS THE FIRST STATEMENT IN THE HANDLER, ABOVE `req.text()`, AND THAT
// ORDERING IS THE POINT. This route reads an ARBITRARY-SIZE BODY into memory
// before it authenticates anything. Limiting after the read would leave the
// expensive half unbounded and count only the reads that already happened.
// Limiting above it means a source over its budget cannot make us read a body
// at all.
//
// IT DOES NOT FIX THE FIRST LARGE BODY. A size cap is the control for that and
// this is not one; the limit bounds REPEATS from a source, not the size of any
// single request. Named here so nobody later reads this as a body-size guard.
//
// MEMORY STORE, NOT THE DURABLE ONE, and the reasoning is the opposite of
// route 2's on purpose. A durable hit is a Postgres upsert and the thing it
// would protect is an HMAC costing microseconds - a limiter more expensive
// than its subject is an amplifier. Route 2 pays that price because its
// subject is a guess budget that a cold start would reset. There is no guess
// budget here, so this is coarse per-instance throttling, which is exactly
// what limiter.ts's header says the memory store is for. It is not a cap.

export const runtime = "nodejs"; // node:crypto + server-only
export const dynamic = "force-dynamic"; // signed, per-request; never cached

export async function POST(req: Request): Promise<Response> {
  // ABOVE the body read, deliberately: see the header. A source over budget
  // must not be able to make us read an arbitrary-size body.
  const verdict = checkRateLimit(
    clientKey(req, "ingestion"),
    RULES.ingestionIp,
  );
  if (!verdict.ok) return tooManyRequests(verdict);

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
  } catch (err) {
    // Observability: this catch used to be bare, collapsing every DB failure
    // into an opaque 500 with no trace of the underlying Postgres error. Emit
    // one structured, PII-free line so the actual failure (SQLSTATE + which
    // constraint/table/routine) is visible in server logs.
    //
    // We log ONLY non-sensitive error metadata. We deliberately EXCLUDE
    // err.detail (it can echo row/field values), the payload, the raw body, and
    // patient_id. The first line of err.message is the error class (e.g. the
    // violated constraint), not the offending row values, which live in detail.
    //
    // The driver is porsager/postgres, which exposes constraint_name /
    // table_name; we also read the node-postgres names (constraint / table) so
    // this stays correct if the driver ever changes.
    const e = (typeof err === "object" && err !== null ? err : {}) as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      table?: unknown;
      table_name?: unknown;
      routine?: unknown;
      message?: unknown;
    };
    console.error(
      "[INGEST-ERR] ingestion DB write failed " +
        JSON.stringify({
          code: e.code,
          constraint: e.constraint ?? e.constraint_name,
          table: e.table ?? e.table_name,
          routine: e.routine,
          message:
            typeof e.message === "string" ? e.message.split("\n")[0] : undefined,
        }),
    );
    // Never surface DB internals or payload content to the caller.
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
