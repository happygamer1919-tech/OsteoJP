/**
 * W13-03 — the login screens' state shape.
 *
 * IN ITS OWN MODULE because `actions.ts` carries `'use server'`, and a
 * `'use server'` file may export nothing but async functions. A constant beside
 * the actions is a build error, not a style problem, so the type and its initial
 * value live here and both the actions and the screen import them.
 */

/**
 * Everything the screen renders is derived from this. One state object rather
 * than an error string, because the step and the error are not independent: a
 * refusal keeps the patient on the code screen, an invalid phone sends them back
 * to the first one, and the phone has to survive both.
 */
export type LoginState = {
  step: 'phone' | 'code'
  /** Carried forward so the code screen can verify without asking again. */
  phone: string
  /** Set once, when a code has just been requested. */
  sent: boolean
  /**
   * An i18n key under `auth.`, never a message. The screen owns the copy; the
   * action owns which case happened.
   */
  error: 'otp_invalid_phone' | 'otp_rate_limited' | 'otp_unavailable' | 'otp_refused' | null
}

export const INITIAL_LOGIN_STATE: LoginState = {
  step: 'phone',
  phone: '',
  sent: false,
  error: null,
}
