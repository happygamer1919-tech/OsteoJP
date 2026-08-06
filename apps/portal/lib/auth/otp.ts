import 'server-only'

import { PORTAL_DEVICE_COOKIE } from './cookie-names'
import {
  clearDeviceToken,
  deviceTokenFromApiResponse,
  readDeviceToken,
  writeDeviceToken,
} from './device'
import { writePortalSession } from './session'

/**
 * W13-03 — the portal's server-side half of Decision D's login.
 *
 * "Patient login is a 6-digit SMS OTP, phone only, with a trusted device of 30
 * days. No password, no magic link, no session minted from any other artefact."
 *
 * EVERY CALL HERE IS SERVER-TO-SERVER, which is the ruling and not a detail. The
 * browser never talks to the API on this flow, so a phone number, a code and two
 * credentials never appear in client-side code, and an XSS on this origin cannot
 * read a response it never receives.
 *
 * WHAT THIS MODULE REFUSES TO DO: turn one API refusal into several. The verify
 * route answers ONE 401 with ONE body for six distinct failures, deliberately, so
 * that a caller cannot use the login screen as a patient-list oracle. Mapping
 * those back onto different screens here would rebuild the oracle in the portal
 * and undo the property the API paid for. `otp_refused` is therefore the single
 * refusal string, and the three degradation copies are shown as STANDING
 * GUIDANCE (see the login screen) rather than as a diagnosis of what went wrong.
 */

/**
 * The tenant this portal deployment serves.
 *
 * WHY AN ENVIRONMENT VARIABLE AND NOT A LOOKUP. Both OTP routes take `tenantId`
 * in the body because they run BEFORE any authentication, so there is no
 * verified token to derive it from and no patient row to read it off — /otp/request
 * deliberately never touches the patient table at all, which is the property that
 * keeps it from leaking clinic membership. The alternatives are a host-to-tenant
 * mapping table (a migration, and the in-flight slot belongs to LOOP 5) or
 * hard-coding an id in source (forbidden, and wrong the first time this app is
 * deployed for a second clinic). A per-deployment variable is the honest shape:
 * one portal deployment serves one clinic.
 *
 * IT FAILS LOUD AND IT FAILS AT CALL TIME. Absent, this throws and the caller
 * turns it into `unavailable` — a screen that says the service is unavailable and
 * a server log naming the VARIABLE, never a value. Not at module scope: Next
 * imports modules during `next build` to collect page data, and a module-scope
 * throw fails the BUILD on every PR, which is the exact defect W13-03a had to
 * unpick on the API side. A build is not a boot.
 */
function tenantId(): string {
  const value = process.env.PORTAL_TENANT_ID
  if (!value) {
    throw new Error('PORTAL_TENANT_ID is not set; the patient login cannot name its tenant')
  }
  return value
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? ''
}

/** Names only, never values, and never the phone or the code (PII rule #7). */
function logUnavailable(where: string, e: unknown): void {
  console.error(`[auth] otp/${where}: ${e instanceof Error ? e.message : 'unavailable'}`)
}

/**
 * What the phone screen can be told. `sent` is returned for a KNOWN and an
 * UNKNOWN number alike, because the API answers 204 for both — that is the
 * enumeration property, and `otp_sent` is worded ("if the number is registered")
 * to be honest about it.
 */
export type RequestOutcome = 'sent' | 'invalid_phone' | 'rate_limited' | 'unavailable'

/** What the code screen can be told. Six failure modes collapse into `refused`. */
export type VerifyOutcome = 'ok' | 'refused' | 'invalid_input' | 'rate_limited' | 'unavailable'

/** POST a 6-digit code to this number, if it is one of ours. */
export async function requestOtp(phone: string): Promise<RequestOutcome> {
  let body: string
  try {
    body = JSON.stringify({ phone, tenantId: tenantId() })
  } catch (e) {
    logUnavailable('request', e)
    return 'unavailable'
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    })
  } catch (e) {
    logUnavailable('request', e)
    return 'unavailable'
  }

  if (res.status === 204) return 'sent'
  if (res.status === 400) return 'invalid_phone'
  if (res.status === 429) return 'rate_limited'
  // 503 and anything unexpected. A login that cannot send is unavailable, and
  // saying so is the whole of PG7's no-silent-degradation posture: the patient
  // must not read a server fault as "I typed my number wrong".
  logUnavailable('request', new Error(`api answered ${res.status}`))
  return 'unavailable'
}

/**
 * Check the code and, on success, take custody of BOTH credentials.
 *
 * The session goes in this app's own cookie via `writePortalSession`; the device
 * token is copied out of the API's Set-Cookie into this app's own device cookie
 * (see `device.ts` for why that copy has to exist at all). Both are opaque here.
 */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOutcome> {
  let body: string
  try {
    body = JSON.stringify({ phone, code, tenantId: tenantId() })
  } catch (e) {
    logUnavailable('verify', e)
    return 'unavailable'
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    })
  } catch (e) {
    logUnavailable('verify', e)
    return 'unavailable'
  }

  if (res.status === 401) return 'refused'
  if (res.status === 400) return 'invalid_input'
  if (res.status === 429) return 'rate_limited'
  if (!res.ok) {
    logUnavailable('verify', new Error(`api answered ${res.status}`))
    return 'unavailable'
  }

  const data = (await res.json().catch(() => null)) as { sessionToken?: string } | null
  // A 200 without a token is not a login. Treating it as one would be the
  // success-shaped nothing PG7 exists to forbid: the patient would be redirected
  // into the portal holding no credential and bounced straight back out.
  if (!data?.sessionToken) {
    logUnavailable('verify', new Error('api answered 200 without a session token'))
    return 'unavailable'
  }

  await writePortalSession(data.sessionToken)

  // Best effort, and deliberately not fatal: a login that succeeded must not be
  // failed because the 30-day convenience could not be stored. The patient is in;
  // they will simply be asked for a code again next time.
  const device = deviceTokenFromApiResponse(res)
  if (device) await writeDeviceToken(device)

  return 'ok'
}

/**
 * Is THIS browser already trusted? Called on the login screen's load.
 *
 * Returns true only when a fresh session has been written, so the caller's only
 * correct response to `true` is to send the patient into the portal.
 *
 * IT ASKS NOTHING WHEN THERE IS NOTHING TO ASK WITH. No device cookie means no
 * round trip: the API would answer 401 on an absent credential anyway, and a
 * network call on every first visit to the login screen would be a cost paid by
 * every patient to learn what this app already knows.
 */
export async function loginWithTrustedDevice(): Promise<boolean> {
  const token = await readDeviceToken()
  if (!token) return false

  let res: Response
  try {
    res = await fetch(`${apiBase()}/api/v1/auth/otp/trusted`, {
      method: 'POST',
      // The credential travels as a Cookie header on a server-to-server call,
      // which is exactly what the API's `readDeviceToken` parses. It is NOT sent
      // as a bearer or a body field: the route takes no body at all, by design,
      // so that there is no caller-supplied value to confuse the device row with.
      headers: { cookie: `${PORTAL_DEVICE_COOKIE}=${token}` },
      cache: 'no-store',
    })
  } catch (e) {
    // A network fault is not a refusal. The device cookie is LEFT ALONE here:
    // dropping a valid 30-day credential because the API was briefly unreachable
    // would cost the patient an SMS for our outage.
    logUnavailable('trusted', e)
    return false
  }

  if (res.status === 401) {
    // The API has refused this device and cleared its own cookie. Clear ours, or
    // the browser presents a dead credential on every visit for 30 days.
    await clearDeviceToken()
    return false
  }

  if (!res.ok) {
    logUnavailable('trusted', new Error(`api answered ${res.status}`))
    return false
  }

  const data = (await res.json().catch(() => null)) as { sessionToken?: string } | null
  if (!data?.sessionToken) {
    logUnavailable('trusted', new Error('api answered 200 without a session token'))
    return false
  }

  await writePortalSession(data.sessionToken)
  return true
}
