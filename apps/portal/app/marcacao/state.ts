/**
 * GUEST-04 — the public form's state, kept out of the action file so the client
 * component can import it without pulling a `'use server'` module into the
 * browser bundle. Same split as `app/auth/login/state.ts`.
 */

/** Four steps. The authenticated portal flow has five; this one has no therapist
 *  step, because Option A does not expose the roster to an anonymous caller. */
export const GUEST_TOTAL_STEPS = 4
export type GuestStep = 1 | 2 | 3 | 4

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
}

export const EMPTY_GUEST_VALUES: GuestValues = {
  locationId: '',
  serviceId: '',
  preferredDate: '',
  preferredPeriod: '',
  fullName: '',
  phone: '',
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
}

export const INITIAL_GUEST_STATE: GuestFormState = {
  step: 1,
  values: EMPTY_GUEST_VALUES,
  consent: false,
  error: null,
  received: false,
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
