// W13-03 (Wave 13 LOOP 3) — how the trusted-device token travels. PG1,
// Decision D's "trusted device of 30 days".
//
// THE TOKEN IS A BEARER CREDENTIAL AND IT IS TREATED AS ONE. Decision D makes
// the SMS code the only factor, so on this flow a trusted device does not skip a
// SECOND factor the way "remember me" does elsewhere — it skips the ONLY one.
// For thirty days, whoever holds this value is the patient. Every attribute
// below follows from that sentence rather than from convention.
//
//   httpOnly   — script cannot read it, so an XSS in the portal cannot exfiltrate
//                a thirty-day credential. The portal never needs the value; it
//                only needs the browser to send it.
//   Secure     — never over plaintext. Set unconditionally rather than "in
//                production", because a flag that weakens itself on a
//                misdetected environment is not a control. Local development
//                over http://localhost is exempted by browsers themselves.
//   SameSite=Lax — the credential must not ride along on a cross-site POST.
//                Strict would also drop it on a legitimate top-level navigation
//                back into the portal from an SMS link, which is precisely the
//                traffic this flow generates; Lax keeps that and still refuses
//                cross-site sub-requests.
//   Path=/     — the API reads it on the auth routes; a narrower path would
//                silently stop matching the moment a route moved.
//   Max-Age    — mirrors the ruled window from ONE source (TRUSTED_DEVICE_TTL_MS)
//                so the cookie and the row cannot drift apart. The ROW is the
//                authority: a browser that ignores Max-Age still meets a row
//                whose expires_at has passed and is refused. The cookie's
//                lifetime is a courtesy to the browser, never the control.
//
// NO DOMAIN ATTRIBUTE, deliberately. The cookie stays host-only on the API
// origin. Adding `Domain=.osteojp.pt` would broadcast a patient credential to
// every subdomain in the estate, including the staff platform and any preview
// host that happens to answer there.

import { TRUSTED_DEVICE_TTL_MS } from "./otp";

/**
 * The cookie name. Prefixed `__Host-` because that prefix is enforced by the
 * BROWSER: it refuses the cookie unless it is Secure, Path=/ and carries no
 * Domain, which pins exactly the three attributes above that a later edit is
 * most likely to relax by accident. A weakened cookie stops working rather than
 * silently becoming weaker.
 */
export const DEVICE_COOKIE = "__Host-ojp_device";

/** Seconds, floored — a Max-Age is an integer count of seconds. */
const MAX_AGE_S = Math.floor(TRUSTED_DEVICE_TTL_MS / 1000);

/** The Set-Cookie value that plants a freshly issued device token. */
export function deviceCookie(token: string): string {
  return [
    `${DEVICE_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_S}`,
  ].join("; ");
}

/**
 * Read the device token out of a request's Cookie header.
 *
 * Hand-parsed rather than reached for through `next/headers` because these
 * routes take a plain `Request` and are unit-tested as plain functions; a helper
 * that needs a Next request context would make the tests prove less than the
 * routes do. Returns null for anything that is not exactly one name=value pair
 * matching the expected shape, so a malformed or duplicated cookie is refused
 * rather than half-read.
 */
export function readDeviceToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== DEVICE_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    // 32 bytes, hex. Anything else never came from generateDeviceToken, and
    // shape-checking here keeps a junk value from reaching a database lookup.
    return /^[0-9a-f]{64}$/.test(value) ? value : null;
  }
  return null;
}
