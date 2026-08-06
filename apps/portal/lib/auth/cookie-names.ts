/**
 * W13-03 — the two patient-auth cookie names, in one place and importable from
 * anywhere in this app.
 *
 * WHY A SEPARATE MODULE. `session.ts` and `device.ts` both carry
 * `import 'server-only'`, which is correct for them: they touch `next/headers`
 * and must never reach a client bundle. But `proxy.ts` also needs to know
 * whether a request carries a session, and middleware cannot import a
 * `server-only` module. Duplicating the string in the middleware is how the
 * name drifts: a rename in one file would leave the other silently checking a
 * cookie nobody sets, and the failure mode is a patient who logs in and is
 * bounced straight back to the login screen.
 *
 * NAMES ONLY. No `next/headers`, no reads, no writes, nothing runtime-specific,
 * so this is safe in the middleware, in a server component and in a test.
 */

/**
 * The portal's own session cookie.
 *
 * `__Host-` prefixed because the BROWSER enforces that prefix: it refuses the
 * cookie unless it is Secure, Path=/ and carries no Domain. A later edit that
 * relaxes any of the three stops the cookie working rather than silently
 * weakening it.
 */
export const PORTAL_SESSION_COOKIE = '__Host-ojp_session'

/**
 * The trusted-device credential, as the PORTAL holds it.
 *
 * SAME NAME AS THE API's DELIBERATELY, and this is the one thing here worth
 * reading twice. The API sets `__Host-ojp_device` on its own host; because
 * `__Host-` means host-only, that cookie is scoped to api.osteojp.pt and this
 * app's origin can never see it. The portal therefore plants its OWN cookie of
 * the same name on the portal host and sends the value back to the API as a
 * `Cookie:` header on the server-to-server call, which is the exact header
 * `readDeviceToken` parses. Keeping the name identical is what makes that
 * forward a copy rather than a translation.
 *
 * `device-cookie-parity.test.ts` reads the API's own module and fails if either
 * name drifts.
 */
export const PORTAL_DEVICE_COOKIE = '__Host-ojp_device'
