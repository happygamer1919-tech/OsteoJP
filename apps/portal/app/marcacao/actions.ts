'use server'

import {
  calendarDaysBetween,
  compareCalendarDates,
  isGuestPreferredPeriod,
  lisbonToday,
  parseCalendarDate,
} from '@osteojp/db'

import { submitGuestRequest } from '@/lib/guest/api'
import { isGuestConfirmationCopyReady } from '@/lib/guest/commitment-copy'

import {
  GUEST_FORM_HORIZON_DAYS,
  GUEST_TOTAL_STEPS,
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
  }
}

/** The FIRST step whose requirements are unmet, or null when all four are. */
function firstIncompleteStep(values: GuestValues): GuestStep | null {
  if (!values.locationId) return 1
  if (!values.serviceId) return 2
  if (!isPreferredWhenValid(values)) return 3
  if (!values.fullName || !values.phone) return 4
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

const clampStep = (n: number): GuestStep =>
  Math.min(GUEST_TOTAL_STEPS, Math.max(1, n)) as GuestStep

export async function guestBookingAction(
  _prev: GuestFormState,
  form: FormData,
): Promise<GuestFormState> {
  const values = readValues(form)
  const consent = form.get('consent') === 'on'
  const intent = str(form, 'intent')
  const step = clampStep(Number(str(form, 'step')) || 1)

  if (intent === 'back') {
    return { step: clampStep(step - 1), values, consent, error: null, received: false }
  }

  if (intent === 'next') {
    // ADVANCE ONLY WHEN THE CURRENT STEP IS ACTUALLY COMPLETE. Checked against
    // the step being left rather than the one being entered, so a form posted
    // with an out-of-order `step` cannot skip a question.
    const incomplete = firstIncompleteStep(values)
    if (incomplete !== null && incomplete <= step) {
      return { step: incomplete, values, consent, error: 'missing_field', received: false }
    }
    return { step: clampStep(step + 1), values, consent, error: null, received: false }
  }

  // ---- submit ----------------------------------------------------------
  const incomplete = firstIncompleteStep(values)
  if (incomplete !== null) {
    return { step: incomplete, values, consent, error: 'missing_field', received: false }
  }

  // RGPD. The acknowledgement is required and is checked HERE, on the server,
  // not only by the `required` attribute on the checkbox - an attribute is a
  // hint to a browser, and consent is the one thing on this form that must be
  // provable rather than assumed.
  if (!consent) {
    return { step: 4, values, consent, error: 'consent_required', received: false }
  }

  // THE COMMITMENT-COPY GATE, CHECKED BEFORE ANYTHING IS WRITTEN.
  //
  // The confirmation screen is where the clinic tells this person what happens
  // next, and its copy is not written yet (JP words it; see
  // lib/guest/commitment-copy.ts). Submitting first and discovering that second
  // would put a real request in reception's queue and then show its sender
  // either a blank screen or an error - the clinic holding somebody's telephone
  // number without that person having any reason to think it arrived.
  //
  // So the refusal happens BEFORE the write, and it is the ordinary
  // "unavailable" message, which promises nothing. The operator gets the reason
  // in the server log.
  if (!isGuestConfirmationCopyReady()) {
    console.error(
      '[guest] submit refused: guest.confirmation_title / guest.confirmation_body ' +
        'are empty. The confirmation copy is unwritten, so no request is accepted.',
    )
    return { step: 4, values, consent, error: 'unavailable', received: false }
  }

  const outcome = await submitGuestRequest({
    fullName: values.fullName,
    phone: values.phone,
    serviceId: values.serviceId,
    locationId: values.locationId,
    preferredDate: values.preferredDate,
    preferredPeriod: values.preferredPeriod,
  })

  if (outcome === 'received') {
    return { step: 4, values, consent, error: null, received: true }
  }
  return { step: 4, values, consent, error: outcome, received: false }
}
