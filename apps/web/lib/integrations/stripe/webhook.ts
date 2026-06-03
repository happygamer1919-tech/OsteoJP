import { createHmac, timingSafeEqual } from "node:crypto";
import { resolveWebhookSecret } from "./config";
import { StripeSignatureError } from "./errors";
import type { SxEvent } from "./types";

// Stripe webhook signature verification.
//
// Stripe signs each webhook with the endpoint's signing secret (whsec_…) and
// sends the signature in the `Stripe-Signature` header:
//
//   Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>,v1=<...>
//
// where the signed payload is `${t}.${rawBody}` (the EXACT bytes received,
// before any JSON parse) and v1 = HMAC-SHA256(signedPayload, secret). There may
// be more than one v1 (during secret rotation); a match against ANY is valid.
//
// Binding the timestamp INTO the signed string makes a captured request
// un-replayable past the tolerance window: an attacker cannot move the timestamp
// without invalidating the signature, and we reject timestamps outside the
// window. This is the same construction as lib/ingestion/hmac.ts, adapted to
// Stripe's header format.
//
// Fail-loud secret: a MISSING signing secret is an operator misconfiguration and
// throws (resolveWebhookSecret) — we must never treat an unverifiable event as
// authentic. A bad/missing/stale signature from the caller is a typed
// StripeSignatureError the route maps to 400 without echoing which check failed.
//
// node:crypto → this module is server-only in the app, but pure/injectable for
// unit tests (pass `secret` + `now` explicitly).

const SIGNATURE_HEADER = "stripe-signature";

/** Max clock skew, in seconds, Stripe's default webhook tolerance. */
export const TOLERANCE_SECONDS = 300;

/** Header lookup that works for either a Headers instance or a plain record. */
function readHeader(headers: Headers | Record<string, string>, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/** Parse `t=…,v1=…,v1=…` into the timestamp + the set of v1 signatures. */
function parseSignatureHeader(header: string): { t: number | null; v1: string[] } {
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [scheme, value] = part.split("=", 2);
    if (scheme === "t") {
      const n = Number(value);
      t = Number.isInteger(n) ? n : null;
    } else if (scheme === "v1" && value) {
      v1.push(value);
    }
  }
  return { t, v1 };
}

/** Compute the expected hex signature for a payload + timestamp under a secret. */
export function signWebhookPayload(rawBody: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * Verify a Stripe webhook signature over the RAW body and return the parsed
 * event. Throws StripeSignatureError on any verification failure (the route maps
 * it to 400 without disclosing which check failed). The secret defaults to
 * STRIPE_WEBHOOK_SECRET (owner-gated, unset → throws StripeConfigError first).
 *
 * This is the "signed and verified webhook handler" entry point: only events
 * that pass here are trusted enough to drive a ledger write.
 */
export function constructEvent(
  rawBody: string,
  headers: Headers | Record<string, string>,
  opts: { secret?: string; now?: Date; toleranceSeconds?: number } = {},
): SxEvent {
  const secret = opts.secret ?? resolveWebhookSecret();
  const now = opts.now ?? new Date();
  const tolerance = opts.toleranceSeconds ?? TOLERANCE_SECONDS;

  const header = readHeader(headers, SIGNATURE_HEADER);
  if (!header) {
    throw new StripeSignatureError("missing_signature", "Stripe-Signature header is absent");
  }

  const { t, v1 } = parseSignatureHeader(header);
  if (t === null || v1.length === 0) {
    throw new StripeSignatureError(
      "malformed_signature",
      "Stripe-Signature header is malformed (missing t or v1)",
    );
  }

  // Replay/skew window: reject timestamps too far in the past OR the future.
  const nowSec = Math.floor(now.getTime() / 1000);
  if (Math.abs(nowSec - t) > tolerance) {
    throw new StripeSignatureError("stale_timestamp", "Webhook timestamp outside tolerance");
  }

  const expected = Buffer.from(signWebhookPayload(rawBody, t, secret));
  const matched = v1.some((candidate) => {
    const got = Buffer.from(candidate);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
  if (!matched) {
    throw new StripeSignatureError("no_match", "No Stripe-Signature v1 entry matched");
  }

  // Signature is valid → the body is authentic; parse it. A parse failure on a
  // signed body is still a malformed-signature-class rejection (it didn't come
  // from a well-formed Stripe event), surfaced non-retryably.
  try {
    return JSON.parse(rawBody) as SxEvent;
  } catch {
    throw new StripeSignatureError(
      "malformed_signature",
      "Verified webhook body is not valid JSON",
    );
  }
}
