'use server'

import { redirect } from 'next/navigation'

import { loginWithTrustedDevice, requestOtp, verifyOtp } from '@/lib/auth/otp'

import type { LoginState } from './state'

/**
 * W13-03 — the login screens' server actions.
 *
 * SERVER ACTIONS AND NOT CLIENT FETCHES, for three reasons that are all the same
 * reason: the phone number, the code and the two credentials must never be
 * handled by client-side code. The browser posts a form to this app's own
 * origin; this app calls the API server-to-server; the credentials come back
 * into `Set-Cookie` headers the browser cannot read. No token is ever in a URL,
 * a query string, or a JSON body that script can see.
 *
 * AND BECAUSE COOKIES CANNOT BE WRITTEN ANYWHERE ELSE. A server COMPONENT may
 * read cookies but not set them, so the trusted-device check — which mints a
 * session — has to live in an action or a route handler. It is an action here so
 * it shares this file's error vocabulary with the other two.
 */

/** Trim only. Normalisation is the API's job (`normalizePhonePT`), and doing it
 * in two places is how the two spellings of the same number drift apart. */
function field(formData: FormData, name: string): string {
  const raw = formData.get(name)
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * THE ONE ACTION BOTH SCREENS POST TO, branching on a hidden `intent` field.
 *
 * One action and not two because `useActionState` owns a single state object,
 * and two hooks would mean two states to keep in step — the exact bookkeeping
 * that loses the phone number between the screens. It also keeps the form
 * working WITHOUT JAVASCRIPT: the `action` attribute points straight at a server
 * action, so a browser that never hydrates still posts and still gets the next
 * screen back. A client-side dispatcher wrapping two actions would have looked
 * tidier and quietly dropped that.
 */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  return formData.get('intent') === 'verify'
    ? verifyCodeAction(prev, formData)
    : sendCodeAction(prev, formData)
}

/** Step one: ask for a code. */
async function sendCodeAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const phone = field(formData, 'phone')
  if (!phone) return { step: 'phone', phone, sent: false, error: 'otp_invalid_phone' }

  const outcome = await requestOtp(phone)

  switch (outcome) {
    case 'sent':
      // FORWARD FOR A KNOWN AND AN UNKNOWN NUMBER ALIKE. The API answers 204 for
      // both, deliberately, and stopping here for one of them would rebuild the
      // patient-list oracle it refuses to be. `otp_sent` is worded for exactly
      // this: "if the number is registered".
      return { step: 'code', phone, sent: true, error: null }
    case 'invalid_phone':
      return { step: 'phone', phone, sent: false, error: 'otp_invalid_phone' }
    case 'rate_limited':
      return { step: 'phone', phone, sent: false, error: 'otp_rate_limited' }
    case 'unavailable':
      return { step: 'phone', phone, sent: false, error: 'otp_unavailable' }
  }
}

/** Step two: check the code, and on success the patient is in. */
async function verifyCodeAction(
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // The hidden field is authoritative so the flow survives without JavaScript;
  // `prev.phone` is the fallback for the hydrated path.
  const phone = field(formData, 'phone') || prev.phone
  const code = field(formData, 'code')

  const outcome = await verifyOtp(phone, code)

  // Outside any try/catch, and it must stay that way: `redirect` signals by
  // throwing, so a catch around it would swallow the navigation and leave a
  // logged-in patient sitting on the login screen.
  if (outcome === 'ok') redirect('/portal/dashboard')

  return {
    step: 'code',
    phone,
    sent: false,
    error:
      outcome === 'rate_limited'
        ? 'otp_rate_limited'
        : outcome === 'unavailable'
          ? 'otp_unavailable'
          : // `refused` and `invalid_input` share one string. A caller must not be
            // able to tell a wrong code from a malformed one, and the patient's
            // next action is identical either way: type the six digits again.
            'otp_refused',
  }
}

/**
 * Decision D's trusted device, spent.
 *
 * Returns false when the browser is not trusted; redirects when it is. It never
 * reports WHY it failed, because there is nothing the patient could do with the
 * answer: the screen behind it is the ordinary phone form.
 */
export async function trustedDeviceAction(): Promise<boolean> {
  const ok = await loginWithTrustedDevice()
  if (ok) redirect('/portal/dashboard')
  return false
}
