import { createHmac, timingSafeEqual } from "node:crypto";

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
