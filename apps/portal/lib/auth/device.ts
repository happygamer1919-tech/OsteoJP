import 'server-only'

import { cookies } from 'next/headers'

import { PORTAL_DEVICE_COOKIE } from './cookie-names'

/**
 * W13-03 — the portal's half of the 30-day trusted device.
 *
 * THE PROBLEM THIS SOLVES, stated first because a committed note says the
 * opposite and the note is wrong on the facts.
 * `W13-03b-session-transport` records that "the DEVICE token is proven absent
 * from the body: it belongs to the browser, and the portal has no use for it."
 * The first half is true and stays true. The second half cannot be: the API
 * plants `__Host-ojp_device` with a Set-Cookie on ITS OWN response, and the
 * only caller of that route is the PORTAL SERVER (Option B, ruled 2026-08-06,
 * every call server-to-server with a Bearer header). A Set-Cookie on a
 * server-to-server fetch lands in the portal server's response object and is
 * discarded. The browser never sees it, so without the copy below the device
 * row is written at every login and read by nobody, and Decision D's "trusted
 * device of 30 days" is a database fact with no path to the patient.
 *
 * THE COPY IS A COPY, NOT AN INTERPRETATION. This module moves an opaque hex
 * string from one Set-Cookie header to another. It does not decode it, does not
 * decide anything from it, and could not: the token is a random 32-byte value
 * whose only meaning lives in a server-side hash comparison. The same posture
 * `session.ts` holds for the session token, for the same reason.
 *
 * WHY THE PORTAL RE-PLANTS RATHER THAN FORWARDING THE HEADER VERBATIM. Passing
 * the API's Set-Cookie through unchanged would set a cookie on the PORTAL host
 * with the API's attributes, which happen to match today and are not guaranteed
 * to tomorrow. Setting it here means this app states the attributes it wants and
 * a change on the API side cannot silently weaken a cookie on this origin.
 */

/**
 * 30 days, mirroring `TRUSTED_DEVICE_TTL_MS` on the API side.
 *
 * A COURTESY, NEVER THE CONTROL, exactly as the API's own comment says of its
 * cookie: the ROW is the authority. A browser that ignores Max-Age still meets a
 * row whose expiry has passed and is refused, and this app has no way to extend
 * anything. Mirroring the window only stops the browser from presenting a
 * credential that is certainly dead.
 */
export const PORTAL_DEVICE_MAX_AGE_S = 30 * 24 * 60 * 60

/**
 * The shape a device token must have to be worth sending anywhere: 32 bytes,
 * hex. Identical to the API's own check in `readDeviceToken`, and applied here
 * for the same reason it is applied there — a junk value should not reach a
 * database lookup, and a value of any other shape never came from
 * `generateDeviceToken`.
 */
const DEVICE_TOKEN_RE = /^[0-9a-f]{64}$/

/** Read the opaque device token this browser holds, or null. */
export async function readDeviceToken(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(PORTAL_DEVICE_COOKIE)?.value
  return value && DEVICE_TOKEN_RE.test(value) ? value : null
}

/**
 * Plant the token the API just issued.
 *
 * `httpOnly` above all: Decision D makes the SMS code the only factor, so a
 * trusted device does not skip a SECOND factor the way "remember me" does
 * elsewhere — for thirty days, whoever holds this value is the patient. Script
 * must not be able to read it, and the portal never needs to.
 */
export async function writeDeviceToken(token: string): Promise<void> {
  if (!DEVICE_TOKEN_RE.test(token)) return
  const store = await cookies()
  store.set(PORTAL_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PORTAL_DEVICE_MAX_AGE_S,
  })
}

/**
 * Drop it. Same attributes, or the browser keeps the old one.
 *
 * Called when the API refuses the device, so an expired or revoked credential
 * stops being presented on every visit for the rest of its Max-Age. The API
 * clears its own cookie on the same refusal; this is the portal-side half of
 * that, and without it the browser would keep paying for a dead row.
 */
export async function clearDeviceToken(): Promise<void> {
  const store = await cookies()
  store.set(PORTAL_DEVICE_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

/**
 * Pull the device token out of an API response's Set-Cookie headers.
 *
 * `getSetCookie()` and not `get('set-cookie')`: the verify route APPENDS two
 * Set-Cookie headers, and `get` folds multiple values into one comma-joined
 * string that cannot be split safely, because a cookie's `Expires` attribute
 * legally contains a comma. `getSetCookie` is the WHATWG-specified accessor that
 * returns them as a list and is present on Node 20+ and on the Edge runtime.
 * The fallback exists only for a runtime that lacks it, and takes the same
 * single-header path the regex already handles.
 *
 * Returns null when the header is absent, which is the ordinary case on a
 * refusal — never an error.
 */
export function deviceTokenFromApiResponse(res: Response): string | null {
  const headers: string[] =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? '']

  for (const header of headers) {
    // Name-anchored: `^` so a cookie whose VALUE happens to contain the name
    // cannot be mistaken for the cookie itself.
    const m = new RegExp(`^${PORTAL_DEVICE_COOKIE}=([0-9a-f]{64})(;|$)`).exec(header.trim())
    if (m) return m[1]
  }
  return null
}
