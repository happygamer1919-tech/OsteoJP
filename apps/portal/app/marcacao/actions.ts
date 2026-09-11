'use server'

import {
  calendarDaysBetween,
  compareCalendarDates,
  isGuestPreferredPeriod,
  lisbonToday,
  parseCalendarDate,
} from '@osteojp/db'
import { CURRENT_INTAKE_CONSENT_VERSION } from '@osteojp/i18n'

import { submitGuestRequest, type GuestIntakeInput } from '@/lib/guest/api'
import {
  guestCopySourceFor,
  isGuestConfirmationCopyReady,
  isGuestCopyApprovedFor,
} from '@/lib/guest/commitment-copy'
import { resolvePortalLocale } from '@/lib/locale-server'

import {
  GUEST_FORM_HORIZON_DAYS,
  GUEST_INTAKE_EARLIEST_BIRTH,
  GUEST_INTAKE_TEXT_MAX,
  guestTotalSteps,
  isGuestIntakeAnswer,
  type GuestFormState,
  type GuestStep,
  type GuestValues,
} from './state'

/**
 * GUEST-04 — the public form's only server entry point.
 *
 * ONE ACTION FOR THE WHOLE WIZARD, driven by an `intent` field, because the
 * alternative is four actions that each have to be told what the other three
 * collected. Every value is carried in the form itself, so a step's validation
 * runs on the server whether or not the browser ran any JavaScript.
 *
 * THIS FILE VALIDATES FOR THE PERSON, NOT FOR THE DATABASE. The API re-checks
 * everything and is the actual boundary: it owns the rate limits, the phone
 * normalisation, the SMS-capability gate and the tenant-wide ceiling, and it
 * would refuse a bad request from a hand-rolled client that never loaded this
 * page. What the checks below buy is a person being told which of four steps to
 * go back to instead of receiving one flat refusal at the end.
 *
 * INTAKE-01 ADDS A FIFTH STEP, the clinical intake, when the flow carries
 * `intake=1` (seeded from the catalog's `intakeEnabled`). It writes nothing
 * until the submit, exactly like the other four: an abandoned intake leaves no
 * row, no draft and no log line (SPEC section 4). Its answers are Article 9
 * health data, so nothing below logs, echoes or puts one in a URL.
 */

const str = (form: FormData, key: string): string => {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

function readValues(form: FormData): GuestValues {
  return {
    locationId: str(form, 'locationId'),
    serviceId: str(form, 'serviceId'),
    preferredDate: str(form, 'preferredDate'),
    preferredPeriod: str(form, 'preferredPeriod'),
    fullName: str(form, 'fullName'),
    phone: str(form, 'phone'),
    dateOfBirth: str(form, 'dateOfBirth'),
    reason: str(form, 'reason'),
    healthConditions: str(form, 'healthConditions'),
    medication: str(form, 'medication'),
    fallsAccidents: str(form, 'fallsAccidents'),
    surgeries: str(form, 'surgeries'),
    pacemaker: str(form, 'pacemaker'),
    pregnancy: str(form, 'pregnancy'),
  }
}

/** The FIRST step whose requirements are unmet, or null when every step is. */
function firstIncompleteStep(values: GuestValues, intake: boolean): GuestStep | null {
  if (!values.locationId) return 1
  if (!values.serviceId) return 2
  if (!isPreferredWhenValid(values)) return 3
  if (!values.fullName || !values.phone) return 4
  if (intake && !isIntakeComplete(values)) return 5
  return null
}

function isPreferredWhenValid(values: GuestValues): boolean {
  if (!isGuestPreferredPeriod(values.preferredPeriod)) return false
  const date = parseCalendarDate(values.preferredDate)
  if (!date) return false
  const today = lisbonToday(new Date())
  if (compareCalendarDates(date, today) < 0) return false
  return calendarDaysBetween(today, date) <= GUEST_FORM_HORIZON_DAYS
}

/** Characters as Postgres counts them (code points), which is what 0087 checks. */
const chars = (s: string): number => Array.from(s).length

/**
 * STEP 5, checked on the server, whatever the browser's `required` did.
 *
 * THE TWO SAFETY QUESTIONS ARE REQUIRED (ruling 2). A post without an answer to
 * either comes back to step 5 with `missing_field`; it is never sent as `nao`
 * and never as "never asked". The date of birth is a real calendar day between
 * 1900-01-01 and today in Lisbon, as 0087 and the API both require.
 */
function isIntakeComplete(values: GuestValues): boolean {
  const dob = parseCalendarDate(values.dateOfBirth)
  const earliest = parseCalendarDate(GUEST_INTAKE_EARLIEST_BIRTH)
  if (!dob || !earliest) return false
  if (compareCalendarDates(dob, earliest) < 0) return false
  if (compareCalendarDates(dob, lisbonToday(new Date())) > 0) return false
  if (!values.reason || chars(values.reason) > GUEST_INTAKE_TEXT_MAX) return false
  for (const optional of [
    values.healthConditions,
    values.medication,
    values.fallsAccidents,
    values.surgeries,
  ]) {
    if (chars(optional) > GUEST_INTAKE_TEXT_MAX) return false
  }
  return isGuestIntakeAnswer(values.pacemaker) && isGuestIntakeAnswer(values.pregnancy)
}

/**
 * The `intake` object of the wire contract. Only called once isIntakeComplete
 * has passed. An optional answer left blank travels as null. The consent LABEL
 * is the current one: it names the consent text this page rendered (WF-19); the
 * tick and its time are set by the API at the insert, never sent from here.
 */
function intakePayload(values: GuestValues): GuestIntakeInput | null {
  const { pacemaker, pregnancy } = values
  if (!isGuestIntakeAnswer(pacemaker) || !isGuestIntakeAnswer(pregnancy)) return null
  return {
    dateOfBirth: values.dateOfBirth,
    reason: values.reason,
    healthConditions: values.healthConditions || null,
    medication: values.medication || null,
    fallsAccidents: values.fallsAccidents || null,
    surgeries: values.surgeries || null,
    pacemaker,
    pregnancy,
    consentVersion: CURRENT_INTAKE_CONSENT_VERSION,
  }
}

export async function guestBookingAction(
  _prev: GuestFormState,
  form: FormData,
): Promise<GuestFormState> {
  const values = readValues(form)
  const consent = form.get('consent') === 'on'
  const intent = str(form, 'intent')
  // INTAKE-01. Carried in the form, like every other value. A hand-posted body
  // can flip it, and gains nothing: without it the API still takes a booking
  // with no intake (a stale portal must not break booking), and with it while
  // the table is absent the API refuses the request as `invalid`.
  const intake = str(form, 'intake') === '1'
  const total = guestTotalSteps(intake)
  const clampStep = (n: number): GuestStep => Math.min(total, Math.max(1, n)) as GuestStep
  const step = clampStep(Number(str(form, 'step')) || 1)
  const at = (s: GuestStep, error: GuestFormState['error'], received = false): GuestFormState => ({
    step: s,
    values,
    consent,
    error,
    received,
    intake,
  })

  if (intent === 'back') {
    return at(clampStep(step - 1), null)
  }

  if (intent === 'next') {
    // ADVANCE ONLY WHEN THE CURRENT STEP IS ACTUALLY COMPLETE. Checked against
    // the step being left rather than the one being entered, so a form posted
    // with an out-of-order `step` cannot skip a question.
    const incomplete = firstIncompleteStep(values, intake)
    if (incomplete !== null && incomplete <= step) {
      return at(incomplete, 'missing_field')
    }
    return at(clampStep(step + 1), null)
  }

  // ---- submit ----------------------------------------------------------
  const incomplete = firstIncompleteStep(values, intake)
  if (incomplete !== null) {
    return at(incomplete, 'missing_field')
  }

  // RGPD. The acknowledgement is required and is checked HERE, on the server,
  // not only by the `required` attribute on the checkbox - an attribute is a
  // hint to a browser, and consent is the one thing on this form that must be
  // provable rather than assumed. It sits on the LAST step, whichever that is.
  if (!consent) {
    return at(total, 'consent_required')
  }

  // THE COMMITMENT-COPY GATE, CHECKED BEFORE ANYTHING IS WRITTEN.
  //
  // The confirmation screen is where the clinic tells this person what happens
  // next, and its copy is a promise the clinic is making (JP words it; see
  // lib/guest/commitment-copy.ts). Submitting first and discovering a problem
  // second would put a real request in reception's queue and then show its
  // sender either a blank screen or an error - the clinic holding somebody's
  // telephone number without that person having any reason to think it arrived.
  //
  // So the refusal happens BEFORE the write, and it is the ordinary
  // "unavailable" message, which promises nothing. The operator gets the reason
  // in the server log.
  //
  // ==========================================================================
  // LANG-01 — IT IS ASKED OF THE LOCALE THIS REQUEST WILL RENDER IN.
  // ==========================================================================
  // The gate used to ask about the `pt` dictionary because `pt` was the only
  // thing anything rendered. `/marcacao?lang=en` changes that, and a gate that
  // went on asking about Portuguese would clear an English submit on the
  // strength of a Portuguese promise.
  //
  // TWO CONDITIONS, NOT ONE, because they are different facts:
  //   READY     the strings exist. Guards an unfilled deployment.
  //   APPROVED  the clinic ratified them IN THIS LANGUAGE. Guards a translation
  //             nobody signed off - which is the English pair's exact status.
  // A non-empty unratified promise passes the first and fails the second, and
  // that is the whole reason the second exists.
  const locale = await resolvePortalLocale()
  if (!isGuestCopyApprovedFor(locale)) {
    console.error(
      `[guest] submit refused: the confirmation commitment is not ratified for locale ` +
        `"${locale}". Only GUEST_COPY_APPROVED_LOCALES may be submitted; see ` +
        `lib/guest/commitment-copy.ts and board card LANG-03.`,
    )
    return at(total, 'unavailable')
  }
  if (!isGuestConfirmationCopyReady(guestCopySourceFor(locale))) {
    console.error(
      '[guest] submit refused: guest.confirmation_title / guest.confirmation_body ' +
        `are empty for locale "${locale}". The confirmation copy is unwritten, so no ` +
        'request is accepted.',
    )
    return at(total, 'unavailable')
  }

  // The six fields, always; the `intake` object only on the five-step flow, so a
  // four-step submit sends byte for byte what it sent before INTAKE-01.
  const answers = intake ? intakePayload(values) : null
  if (intake && !answers) {
    // Unreachable: firstIncompleteStep already required both answers.
    return at(5, 'missing_field')
  }
  const outcome = await submitGuestRequest({
    fullName: values.fullName,
    phone: values.phone,
    serviceId: values.serviceId,
    locationId: values.locationId,
    preferredDate: values.preferredDate,
    preferredPeriod: values.preferredPeriod,
    ...(answers ? { intake: answers } : {}),
  })

  if (outcome === 'received') {
    return at(total, null, true)
  }
  return at(total, outcome)
}
