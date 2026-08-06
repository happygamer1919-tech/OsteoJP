import 'server-only'

import { cookies } from 'next/headers'

/**
 * W13-03b — the portal's half of the patient session. Owner ruling 2026-08-06,
 * Option B: the PORTAL owns the cookie, the API only signs and verifies.
 *
 * WHY THE PORTAL HOLDS A COOKIE AT ALL. The API sets `__Host-ojp_session` on its
 * own host, and `__Host-` means host-only: the browser scopes it to
 * api.osteojp.pt and the portal — a different host — can never read it. The
 * portal also never calls the API from the browser; every call is
 * server-to-server with an `Authorization: Bearer` header
 * (lib/api/client.ts). So the portal takes the token from the API's response
 * BODY, wraps it in its own `__Host-` cookie here, and forwards it as a Bearer
 * afterwards — the call pattern that already existed.
 *
 * THE TOKEN IS OPAQUE TO THIS APP, and that is the ruling's first constraint,
 * not a stylistic choice. Nothing here parses it, decodes it, reads its expiry,
 * or decides anything from its contents. It is a string that goes in a cookie
 * and comes back out. THE API IS THE SINGLE VERIFIER, FOREVER — it holds the
 * only signing secret, so the portal could not verify honestly even if it tried,
 * and a portal that "checked" a token it cannot verify would be checking the
 * attacker's own claims. `session-opacity.test.ts` asserts no decode or verify
 * symbol is reachable in this app against this token.
 *
 * EXPIRY IS THE API's ANSWER, NOT OURS. The cookie's Max-Age mirrors the ruled
 * 12 hours so a dead cookie is usually dropped by the browser, but that is a
 * courtesy: the authority is the API refusing an expired token. A portal that
 * decided "still valid" from a Max-Age would be guessing.
 */

/**
 * `__Host-` prefixed for the same reason the API's is: the BROWSER enforces the
 * prefix, refusing the cookie unless it is Secure, Path=/ and carries no Domain.
 * A later edit that relaxes any of those stops the cookie working rather than
 * silently weakening it.
 */
export const PORTAL_SESSION_COOKIE = '__Host-ojp_session'

/** Mirrors the ruled artefact: 12 hours. Not an independent decision. */
export const PORTAL_SESSION_MAX_AGE_S = 12 * 60 * 60

/** Read the opaque token, or null. */
export async function readPortalSession(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(PORTAL_SESSION_COOKIE)?.value
  return value && value.length > 0 ? value : null
}

/**
 * Store the token the API just returned.
 *
 * `httpOnly` so script cannot read it, `secure` and `sameSite: 'lax'` to match
 * the API's own cookie, and `path: '/'` because the `__Host-` prefix requires it.
 */
export async function writePortalSession(token: string): Promise<void> {
  const store = await cookies()
  store.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PORTAL_SESSION_MAX_AGE_S,
  })
}

/** Drop it. Same attributes, or the browser keeps the old one. */
export async function clearPortalSession(): Promise<void> {
  const store = await cookies()
  store.set(PORTAL_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
