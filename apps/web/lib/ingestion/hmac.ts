import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// HMAC verification for the AI partner ingestion endpoint.
//
// The partner signs the RAW request body (exact bytes, before any JSON parse)
// together with a unix-seconds timestamp, under a shared secret. The wire
// contract, mirrored on our side:
//
//   X-OsteoJP-Timestamp: <unix seconds>
//   X-OsteoJP-Signature: <hex HMAC-SHA256 of `${timestamp}.${rawBody}`>
//
// Binding the timestamp INTO the signed string is what makes a captured request
// un-replayable past the window: an attacker cannot change the timestamp without
// invalidating the signature, and we reject timestamps outside ±REPLAY_WINDOW.
//
// Mirrors the fail-loud-secret pattern in lib/reminders/link-token.ts: the
// secret is read at call time and NEVER logged. A MISSING SECRET is a server
// misconfiguration and fails loud (throws) — we must not silently treat every
// request as unverifiable. A MISSING or BAD SIGNATURE from the caller is a
// client error and is reported as a typed rejection the route maps to 401.
// Signature comparison is constant-time.

const SECRET_ENV = "AI_INGESTION_HMAC_SECRET";
const TIMESTAMP_HEADER = "x-osteojp-timestamp";
const SIGNATURE_HEADER = "x-osteojp-signature";

/** Max clock skew, in seconds, between the partner's timestamp and our clock. */
export const REPLAY_WINDOW_SECONDS = 300;

export type SignatureRejection =
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "stale_timestamp"
  | "bad_signature";

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: SignatureRejection };

function requireSecret(): string {
  const secret = process.env[SECRET_ENV];
  if (!secret) {
    // Fail loud: a misconfigured ingestion secret is an operator error, not a
    // per-request auth failure. Never mint/accept unverifiable requests.
    throw new Error(`ingestion/hmac: ${SECRET_ENV} is not configured`);
  }
  return secret;
}

export function signIngestionBody(rawBody: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Header lookup that works for either a Headers instance or a plain record. */
function readHeader(headers: Headers | Record<string, string>, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/**
 * Verify the signature over the raw body. Returns a typed result; the route maps
 * any `{ ok: false }` to 401 without echoing the reason to the caller (so we
 * never disclose which check failed). Throws only if the secret env is unset.
 */
export function verifyIngestionSignature(
  rawBody: string,
  headers: Headers | Record<string, string>,
  now: Date = new Date(),
): VerifyResult {
  const secret = requireSecret();

  const sig = readHeader(headers, SIGNATURE_HEADER);
  if (!sig) return { ok: false, reason: "missing_signature" };

  const tsRaw = readHeader(headers, TIMESTAMP_HEADER);
  if (!tsRaw) return { ok: false, reason: "missing_timestamp" };

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || !Number.isInteger(ts)) {
    return { ok: false, reason: "malformed_timestamp" };
  }

  // Replay/skew window: reject timestamps too far in the past OR the future.
  const nowSec = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSec - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = signIngestionBody(rawBody, ts, secret);
  const got = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true };
}

// --- TEMPORARY DIAGNOSTICS -------------------------------------------------
// Emits ONE structured [HMAC-DIAG] line per FAILED verification so we can
// reconcile the partner's signing against ours during the live integration
// test. This is logging only: it re-reads the same inputs that
// verifyIngestionSignature() saw and recomputes the expected signature for
// comparison. It never mutates state, never changes the verify result, and is
// only called once the route already has an `{ ok: false }`.
//
// SECRET SAFETY: never logs the secret or any substring of it. Only the
// secret's character length and the first 8 hex chars of sha256(secret) — a
// non-reversible fingerprint that lets us confirm both sides hold the same key.
// Body CONTENT is never logged either (only its byte length), so this stays
// within the no-PII-in-logs rule.
//
// REMOVE this block AND its call site in
// app/api/v1/ingestion/clinical-records/route.ts once the live HMAC handshake
// with the AI partner is proven. TODO(remove-after-live-test).

function secretDiagnosticFingerprint(secret: string): string {
  const digest = createHash("sha256").update(secret).digest("hex");
  return `len=${secret.length},sha256_8=${digest.slice(0, 8)}`;
}

export function logHmacVerificationFailure(
  rawBody: string,
  headers: Headers | Record<string, string>,
  reason: SignatureRejection,
  now: Date = new Date(),
): void {
  const secret = process.env[SECRET_ENV];
  // Unreachable when verify returned a typed rejection (secret was present),
  // but guard so diagnostics can never throw and never log a fingerprint of "".
  if (!secret) return;

  const check: "timestamp_window" | "signature_mismatch" =
    reason === "missing_timestamp" ||
    reason === "malformed_timestamp" ||
    reason === "stale_timestamp"
      ? "timestamp_window"
      : "signature_mismatch";

  const receivedTimestamp = readHeader(headers, TIMESTAMP_HEADER);
  const receivedSignature = readHeader(headers, SIGNATURE_HEADER);
  const serverEpochSeconds = Math.floor(now.getTime() / 1000);
  const bodyByteLength = Buffer.byteLength(rawBody);

  // Recompute the signature exactly as verify would — but only when the
  // timestamp is a usable integer, since there is nothing valid to sign
  // otherwise. Matches the Number()/Number.isInteger() guard above.
  const ts = Number(receivedTimestamp);
  const computedSignature =
    receivedTimestamp !== null && Number.isFinite(ts) && Number.isInteger(ts)
      ? signIngestionBody(rawBody, ts, secret)
      : "n/a (timestamp unusable)";

  console.warn(
    "[HMAC-DIAG] ingestion signature verification failed " +
      JSON.stringify({
        check,
        reason,
        receivedTimestamp,
        serverEpochSeconds,
        receivedSignature,
        computedSignature,
        bodyByteLength,
        secretFingerprint: secretDiagnosticFingerprint(secret),
      }),
  );
}
