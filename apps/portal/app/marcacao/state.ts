/**
 * GUEST-04 — the public form's state, kept out of the action file so the client
 * component can import it without pulling a `'use server'` module into the
 * browser bundle. Same split as `app/auth/login/state.ts`.
 */

/** Four steps. The authenticated portal flow has five; this one has no therapist
 *  step, because Option A does not expose the roster to an anonymous caller. */
export const GUEST_TOTAL_STEPS = 4

/**
 * INTAKE-01: FIVE steps once the clinical intake is switched on. The fifth is the
 * intake, after the details and before the submit, and the RGPD tick moves onto
 * it, because a consent that covers health answers cannot come before them
 * (SPEC-guest-clinical-intake section 2).
 *
 * WHEN IT IS ON is a fact about the deployment, not about the visitor: the guest
 * catalog reports `intakeEnabled` once migration 0087's table exists, and until
 * then the flow is exactly today's four steps. It NEVER varies by phone number
 * (ruling 1, no oracle).
 */
export const GUEST_INTAKE_TOTAL_STEPS = 5
export type GuestStep = 1 | 2 | 3 | 4 | 5

export const guestTotalSteps = (intake: boolean): 4 | 5 =>
  intake ? GUEST_INTAKE_TOTAL_STEPS : GUEST_TOTAL_STEPS

/**
 * The two clinical safety questions answer ONLY `sim` or `nao` on this form.
 * Storage has a third state, `nao_perguntado`, and this form can never produce
 * it (ruling 2): both are required, neither radio is pre-checked, and a post
 * without an answer is sent back to step 5 rather than stored as "never asked".
 */
export type GuestIntakeAnswer = 'sim' | 'nao'
export const isGuestIntakeAnswer = (v: string): v is GuestIntakeAnswer =>
  v === 'sim' || v === 'nao'

/** 0087: `reason` is 1-2000 characters trimmed, the four optional texts at most 2000. */
export const GUEST_INTAKE_TEXT_MAX = 2000

/** 0087: `CHECK (date_of_birth >= DATE '1900-01-01')`. The form's `min`. */
export const GUEST_INTAKE_EARLIEST_BIRTH = '1900-01-01'

/**
 * How far ahead the form offers a date. Mirrors `GUEST_REQUEST_HORIZON_DAYS` in
 * `apps/api/app/api/v1/booking/guest/route.ts`, which is the ENFORCEMENT point
 * and refuses independently of anything here.
 *
 * IT LIVES IN THIS FILE AND NOT IN `actions.ts` because a `'use server'` module
 * may export only async functions — Next fails the BUILD on a constant, which
 * typecheck does not catch. Both the page (for the date input's `max`) and the
 * action (for the check) import it from here, so the bound the person is offered
 * and the bound the server applies cannot drift apart.
 */
export const GUEST_FORM_HORIZON_DAYS = 90

/**
 * Everything the form has collected. Carried through every post as hidden
 * fields, so the flow behaves identically with and without JavaScript and no
 * value lives only in client memory.
 */
export type GuestValues = {
  locationId: string
  serviceId: string
  preferredDate: string
  preferredPeriod: string
  fullName: string
  phone: string
  /* INTAKE-01, step 5. Named EXACTLY as the wire keys of the `intake` object on
     POST /api/v1/booking/guest, so the Article 9 source guard, which reads its
     vocabulary from the wire, recognises every one of them in this app too.
     Empty strings on the four-step flow: nothing here is ever sent then. */
  dateOfBirth: string
  reason: string
  healthConditions: string
  medication: string
  fallsAccidents: string
  surgeries: string
  /** '' until the visitor presses one. Never defaulted to 'nao'. */
  pacemaker: string
  pregnancy: string
}

/** The step-5 keys, so a step can carry every OTHER answer as a hidden field. */
export const GUEST_INTAKE_KEYS = [
  'dateOfBirth',
  'reason',
  'healthConditions',
  'medication',
  'fallsAccidents',
  'surgeries',
  'pacemaker',
  'pregnancy',
] as const satisfies readonly (keyof GuestValues)[]

export const EMPTY_GUEST_VALUES: GuestValues = {
  locationId: '',
  serviceId: '',
  preferredDate: '',
  preferredPeriod: '',
  fullName: '',
  phone: '',
  dateOfBirth: '',
  reason: '',
  healthConditions: '',
  medication: '',
  fallsAccidents: '',
  surgeries: '',
  pacemaker: '',
  pregnancy: '',
}

/**
 * What the screen may be told.
 *
 * `consent_required` IS ITS OWN OUTCOME and not folded into `invalid`. A person
 * who filled everything in correctly and did not tick the RGPD box has made one
 * specific, correctable choice, and telling them "check the details you entered"
 * would send them back through four steps looking for a mistake they did not
 * make.
 *
 * `unavailable` covers the server being unable to act, INCLUDING the case where
 * the confirmation copy is not written yet. That is deliberate: the person is
 * told the truth (we cannot take this right now) rather than a blank promise,
 * and the operator is told which key is empty in the log.
 */
export type GuestError =
  | 'invalid'
  | 'rate_limited'
  | 'unavailable'
  | 'consent_required'
  | 'missing_field'

export type GuestFormState = {
  step: GuestStep
  values: GuestValues
  consent: boolean
  error: GuestError | null
  /** Set only by an accepted submit. The confirmation screen renders off this
   *  and off nothing else — see the comment in GuestBookingForm. */
  received: boolean
  /**
   * INTAKE-01: whether THIS flow has the fifth step. Seeded from the catalog's
   * `intakeEnabled` on the first render and then carried in the form like every
   * other value, so a flow that started with four steps finishes with four and
   * one that started with five finishes with five, with or without JavaScript.
   */
  intake: boolean
}

export const INITIAL_GUEST_STATE: GuestFormState = {
  step: 1,
  values: EMPTY_GUEST_VALUES,
  consent: false,
  error: null,
  received: false,
  intake: false,
}

/**
 * The services offered at a chosen clinic.
 *
 * A SERVICE NAMES THE CLINICS THAT OFFER IT, and the list is never empty: the
 * catalog endpoint drops a service offered at no active clinic before the
 * response is built ("A service offered at NO active clinic is not listed at
 * all"), because it would be an unpickable row - every clinic choice would
 * filter it away and the visitor would see a name they can never reach.
 *
 * THAT IS THE GUEST-08 RULING, 2026-08-19: offered-only-where-priced. An empty
 * list here is therefore not "every clinic"; it is a service the clinic has
 * turned off everywhere, and offering it would contradict the screen the clinic
 * maintains (Administracao > Servicos shows it as "Nao oferecido aqui").
 *
 * It is a function rather than an inline filter so the rule can be TESTED: this
 * app has no React testing library, so a predicate inside a component is a
 * predicate nobody can ask a question of.
 */
export function servicesForClinic<T extends { locationIds: string[] }>(
  services: readonly T[],
  locationId: string,
): T[] {
  if (!locationId) return [...services]
  return services.filter((sv) => sv.locationIds.includes(locationId))
}
