import { readDeviceToken } from '@/lib/auth/device'

import { LoginOtp } from './LoginOtp'

/**
 * W13-03 — the patient portal's only way in. Decision D: "patient login is a
 * 6-digit SMS OTP, phone only, with a trusted device of 30 days. No password, no
 * magic link, no session minted from any other artefact."
 *
 * WHAT THIS PAGE REPLACED, so nobody restores it by accident. It was an email
 * and password form calling `supabase.auth.signInWithPassword`, with links to a
 * password-recovery screen and an account-activation screen. All three minted a
 * SUPABASE session for a patient, which is the artefact Decision D excludes, and
 * they survived the magic-link removal on 2026-08-05 only because deleting them
 * then would have left the portal with no login at all. That reason expired with
 * this page: `no-magic-link.test.ts` now asserts their absence instead.
 *
 * A SERVER COMPONENT, and it does exactly one thing: read whether this browser
 * carries a device cookie. It cannot do the trusted-device CHECK itself — that
 * mints a session, and a session means writing a cookie, which Next allows only
 * in a server action or a route handler. So the read happens here and the check
 * happens in an action the client fires on mount, which is also what keeps a
 * first-time visitor from paying a round trip to learn nothing.
 *
 * IT DOES NOT REDIRECT AN ALREADY-SIGNED-IN PATIENT. `proxy.ts` owns that, for
 * every route at once; a second copy here would be a second thing to keep in
 * step with the cookie's name.
 */
export default async function LoginPage() {
  const deviceKnown = (await readDeviceToken()) !== null
  return <LoginOtp deviceKnown={deviceKnown} />
}
