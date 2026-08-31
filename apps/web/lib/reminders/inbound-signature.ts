// X-Twilio-Signature validation for the inbound-SMS webhook.
//
// THE ONLY AUTHENTICATION THIS ROUTE HAS. There is no Supabase session on it
// (the path is excluded from the session proxy, like the IfThenPay and Stripe
// webhooks), and its effect is a STATUS CHANGE ON A REAL APPOINTMENT. Without
// this check anyone who learns the URL can cancel a stranger's appointment by
// POSTing a form with their phone number in it.
//
// THE ALGORITHM IS TWILIO'S, restated here rather than imported from the SDK.
// Twilio's own definition:
//
//   1. Take the full request URL exactly as Twilio was configured with it,
//      query string included.
//   2. For an application/x-www-form-urlencoded POST, sort the POST parameters
//      by key (byte order) and append `key + value` for each, with no
//      separators.
//   3. HMAC-SHA1 that string with the account's AUTH TOKEN, base64 the digest.
//
// WHY NOT `twilio.validateRequest`. The SDK is imported LAZILY and only on the
// live send path (clients.ts), so that a sandbox deploy loads no provider code
// and fires no network calls; a webhook that imported it at module scope would
// pull the whole SDK into every request that touches this route. The algorithm
// is nine lines and is pinned by a test against Twilio's own published example
// vector, which is a stronger guarantee than "the SDK agrees with itself".
//
// PII / secret rule: the auth token is used inside the HMAC and never logged,
// returned, or compared with `===`.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The signature Twilio would have sent for this (url, params) pair.
 * Exported for the vector test; product code calls `verifyTwilioSignature`.
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  // Byte-order sort, which is what `Array.prototype.sort` does for ASCII keys
  // and what Twilio specifies. Locale-aware collation would reorder keys that
  // differ only in case and produce a signature that never matches.
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

/**
 * Constant-time comparison of the expected and received signatures.
 *
 * `timingSafeEqual` THROWS on a length mismatch, which would turn a malformed
 * header into a 500 and, worse, into a length oracle by way of the error. The
 * length is checked first and a mismatch is simply `false`.
 */
export function verifyTwilioSignature(args: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signature: string | null;
}): boolean {
  if (!args.signature) return false;
  const expected = computeTwilioSignature(args.authToken, args.url, args.params);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(args.signature, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The URL the signature was computed over.
 *
 * IT IS NOT `request.url`, AND THAT IS THE WHOLE REASON THIS FUNCTION EXISTS.
 * Twilio signs the URL IT WAS CONFIGURED WITH. Behind Vercel's proxy the
 * incoming `request.url` can carry the internal host and, on a preview
 * deployment, a different origin entirely - so signing against it fails every
 * legitimate request while still accepting nothing forged. `x-forwarded-proto`
 * and `x-forwarded-host` are attacker-controllable headers on an open route,
 * so they are NOT consulted either: trusting them would let a forger choose
 * the string their own signature was computed over, which defeats the check
 * completely.
 *
 * The origin therefore comes from CONFIGURATION. `REMINDERS_INBOUND_BASE_URL`
 * is the public origin the Twilio console points at, and it has no default:
 * an unset value refuses every request rather than guessing an origin.
 */
export function signedRequestUrl(pathWithQuery: string): string | null {
  const base = process.env.REMINDERS_INBOUND_BASE_URL;
  if (!base || base.trim() === "") return null;
  return `${base.replace(/\/$/, "")}${pathWithQuery}`;
}
