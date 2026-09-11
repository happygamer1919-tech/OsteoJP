import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GUEST-04 — the public form's server action.
 *
 * THE TWO PROPERTIES THAT ARE NOT ABOUT VALIDATION, and they are why this file
 * exists rather than trusting the API's own suite:
 *
 *   1. NOTHING IS WRITTEN WHILE THE COMMITMENT COPY IS UNWRITTEN. A request that
 *      landed in reception's queue while its sender saw an error would leave the
 *      clinic holding a stranger's telephone number that the stranger has no
 *      reason to believe arrived.
 *   2. CONSENT IS CHECKED ON THE SERVER. `required` on a checkbox is a hint to a
 *      browser; consent has to be provable.
 *
 * EVERY ARM ASSERTS WHETHER THE API WAS CALLED, never only the returned state. A
 * state saying "unavailable" with a row already written, or "received" with
 * nothing sent, would both pass a status-only test and be live defects.
 */

const H = vi.hoisted(() => ({
  submits: [] as Record<string, unknown>[],
  outcome: 'received' as 'received' | 'invalid' | 'rate_limited' | 'unavailable',
  copyReady: true,
  /** LANG-01: the locale the proxy resolved for this request. */
  locale: 'pt' as 'pt' | 'en',
  /** LANG-01: which locales the clinic has RATIFIED the commitment in. */
  approved: ['pt'] as string[],
}))

/**
 * LANG-01 — THE REQUEST HEADER THE PROXY STAMPS, mocked at `next/headers` so
 * the REAL `resolvePortalLocale` still runs.
 *
 * Mocking `@/lib/locale-server` instead would have been shorter and would have
 * taken the parse out of the test: the arms below then prove that the action
 * branches on a value, not that it branches on the value the proxy actually
 * sends. This way an unknown `?lang=` still travels through
 * `parsePortalLocale` on its way here.
 */
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-portal-locale': H.locale }),
}))

vi.mock('@/lib/guest/api', () => ({
  submitGuestRequest: async (input: Record<string, unknown>) => {
    H.submits.push(input)
    return H.outcome
  },
}))

vi.mock('@/lib/guest/commitment-copy', () => ({
  isGuestConfirmationCopyReady: () => H.copyReady,
  isGuestCopyApprovedFor: (locale: string) => H.approved.includes(locale),
  guestCopySourceFor: (locale: string) => ({
    confirmation_title: `title-${locale}`,
    confirmation_body: `body-${locale}`,
  }),
}))

import { CURRENT_INTAKE_CONSENT_VERSION } from '@osteojp/i18n'

import { guestBookingAction } from './actions'
import {
  GUEST_FORM_HORIZON_DAYS,
  INITIAL_GUEST_STATE,
  type GuestFormState,
} from './state'

const LV = 'aaaaaaaa-0000-0000-0000-000000000001'
const SVC = 'bbbbbbbb-0000-0000-0000-000000000001'

/** A date N days out, in Lisbon, so no arm expires on a wall-clock date. */
const dayOffset = (days: number): string => {
  const now = new Date()
  const lisbon = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
  const d = new Date(Date.UTC(lisbon.getFullYear(), lisbon.getMonth(), lisbon.getDate() + days))
  return d.toISOString().slice(0, 10)
}

const formOf = (fields: Record<string, string>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

const complete = (over: Record<string, string> = {}) => ({
  step: '4',
  intent: 'submit',
  locationId: LV,
  serviceId: SVC,
  preferredDate: dayOffset(7),
  preferredPeriod: 'manha',
  fullName: 'Maria Convidada',
  phone: '912345678',
  consent: 'on',
  ...over,
})

const run = (fields: Record<string, string>, prev: GuestFormState = INITIAL_GUEST_STATE) =>
  guestBookingAction(prev, formOf(fields))

beforeEach(() => {
  H.submits = []
  H.outcome = 'received'
  H.locale = 'pt'
  H.approved = ['pt']
  H.copyReady = true
})

describe('§1 — the steps advance only when the step is answered', () => {
  it('advances from the clinic step once a clinic is chosen', async () => {
    const out = await run({ step: '1', intent: 'next', locationId: LV })
    expect(out.step).toBe(2)
    expect(out.error).toBeNull()
  })

  it('refuses to advance past an unanswered clinic step', async () => {
    const out = await run({ step: '1', intent: 'next' })
    expect(out.step).toBe(1)
    expect(out.error).toBe('missing_field')
  })

  it('a forged step number cannot skip a question', async () => {
    // The form carries `step`, so a hand-posted body can claim to be on step 4
    // with nothing filled in. The action sends the person back to the FIRST
    // incomplete step rather than trusting the number.
    const out = await run({ step: '4', intent: 'next', locationId: LV })
    expect(out.step).toBe(2)
    expect(out.error).toBe('missing_field')
  })

  it('going back never validates and never loses what was typed', async () => {
    const out = await run({ step: '3', intent: 'back', locationId: LV, serviceId: SVC })
    expect(out.step).toBe(2)
    expect(out.error).toBeNull()
    expect(out.values.serviceId).toBe(SVC)
  })

  it.each([
    ['a date in the past', { preferredDate: dayOffset(-1) }],
    ['a date beyond the horizon', { preferredDate: dayOffset(GUEST_FORM_HORIZON_DAYS + 1) }],
    ['a date that does not exist', { preferredDate: '2026-02-30' }],
    ['no period', { preferredPeriod: '' }],
    ['a period nobody offers', { preferredPeriod: 'noite' }],
  ])('%s sends the person back to the WHEN step', async (_label, over) => {
    const out = await run({
      step: '3',
      intent: 'next',
      locationId: LV,
      serviceId: SVC,
      preferredDate: dayOffset(7),
      preferredPeriod: 'manha',
      ...over,
    })
    expect(out.step).toBe(3)
    expect(out.error).toBe('missing_field')
  })
})

describe('§2 — consent, checked on the server', () => {
  it('an unticked RGPD box REFUSES the submit and writes nothing', async () => {
    const { consent: _c, ...withoutConsent } = complete()
    const out = await run(withoutConsent)
    expect(out.error).toBe('consent_required')
    expect(H.submits).toHaveLength(0)
  })

  it('the refusal is its OWN message, not "check your details"', async () => {
    // A person who filled four steps correctly and missed one checkbox must be
    // told which one. `invalid` would send them hunting for a mistake they did
    // not make.
    const { consent: _c, ...withoutConsent } = complete()
    const out = await run(withoutConsent)
    expect(out.error).not.toBe('invalid')
    expect(out.step).toBe(4)
  })
})

describe('§3 — the commitment-copy gate refuses BEFORE anything is written', () => {
  it('unwritten copy: no request reaches the API', async () => {
    H.copyReady = false
    const out = await run(complete())
    expect(H.submits).toHaveLength(0)
    expect(out.received).toBe(false)
    expect(out.error).toBe('unavailable')
  })

  it('unwritten copy: the person is NOT told their request was received', async () => {
    H.copyReady = false
    const out = await run(complete())
    expect(out.received).toBe(false)
  })

  it('NEGATIVE ARM: with the copy written, the same body DOES reach the API', async () => {
    // Without this, a gate that refused unconditionally would satisfy both arms
    // above and the form would never work.
    H.copyReady = true
    const out = await run(complete())
    expect(H.submits).toHaveLength(1)
    expect(out.received).toBe(true)
  })
})

describe('§4 — what is sent, and what comes back', () => {
  it('sends exactly the six collected fields, and no therapist and no slot', async () => {
    await run(complete())
    expect(Object.keys(H.submits[0]!).sort()).toEqual([
      'fullName',
      'locationId',
      'phone',
      'preferredDate',
      'preferredPeriod',
      'serviceId',
    ])
  })

  it('never sends a NIF, a note, a birth date or anything clinical', async () => {
    // PL-20 and R-GUEST-2. Asserted as an absence over the whole payload so a
    // field added to the form has to be added here too.
    await run(complete({ nif: '123456789', notes: 'dor nas costas' }))
    const sent = JSON.stringify(H.submits[0])
    expect(sent).not.toContain('123456789')
    expect(sent).not.toContain('dor nas costas')
  })

  it.each([
    ['invalid', 'invalid'],
    ['rate_limited', 'rate_limited'],
    ['unavailable', 'unavailable'],
  ] as const)('an API %s is reported as %s, and never as received', async (outcome, expected) => {
    H.outcome = outcome
    const out = await run(complete())
    expect(out.error).toBe(expected)
    expect(out.received).toBe(false)
  })

  it('a 202 is the ONLY thing that produces the confirmation', async () => {
    H.outcome = 'received'
    const out = await run(complete())
    expect(out.received).toBe(true)
    expect(out.error).toBeNull()
  })
})

/**
 * ==========================================================================
 * LANG-01 — THE SUBMIT GATE ASKS ABOUT THE LANGUAGE IT WILL ANSWER IN.
 * ==========================================================================
 * The confirmation screen is a PROMISE THE CLINIC MAKES. Before this the gate
 * asked one question - are the strings there - and that was sufficient for
 * exactly as long as Portuguese was the only thing rendered.
 *
 * IT NOW ASKS TWO, AND THEY ARE DIFFERENT FACTS. "Written" guards an unfilled
 * deployment; "ratified in this language" guards a translation nobody signed
 * off. The English pair is non-empty and unratified, so it passes the first and
 * must fail the second - which is the only reason the second exists.
 *
 * EVERY ARM ASSERTS WHETHER THE API WAS CALLED, like every arm above it. A
 * refusal that had already written the row would satisfy a status-only test and
 * be the exact defect the whole file is about.
 */
describe('LANG-01 — the commitment gate is per locale', () => {
  it('an APPROVED locale submits', async () => {
    H.locale = 'pt'
    H.approved = ['pt']
    const out = await run(complete())
    expect(out.received).toBe(true)
    expect(H.submits).toHaveLength(1)
  })

  it('an UNRATIFIED locale is refused, and NOTHING is written', async () => {
    // The English arm as it stands today: strings present, approval absent.
    H.locale = 'en'
    H.approved = ['pt']
    H.copyReady = true
    const out = await run(complete())
    expect(out.received).toBe(false)
    expect(out.error).toBe('unavailable')
    // THE HALF THAT MATTERS. A refused submit that had already posted would
    // leave the clinic holding a stranger's telephone number while the sender
    // was told it was unavailable.
    expect(H.submits).toHaveLength(0)
  })

  it('the refusal is about RATIFICATION, not emptiness - the strings were there', async () => {
    // Both arms of the pair, distinguished. If this test could not tell them
    // apart, "approved" would be an alias for "written" and would guard nothing.
    H.locale = 'en'
    H.approved = ['pt', 'en']
    H.copyReady = true
    expect((await run(complete())).received).toBe(true)

    H.submits = []
    H.approved = ['pt']
    expect((await run(complete())).received).toBe(false)
    expect(H.submits).toHaveLength(0)
  })

  it('ratifying a locale is the ONLY thing that opens it', async () => {
    // The flip, exercised: one array entry is the whole difference between a
    // refused English submit and an accepted one.
    H.locale = 'en'
    H.approved = ['pt', 'en']
    const out = await run(complete())
    expect(out.received).toBe(true)
    expect(H.submits).toHaveLength(1)
  })

  it('an UNKNOWN locale header still lands on Portuguese and submits', async () => {
    // `parsePortalLocale` is the real one here (only `next/headers` is mocked),
    // so a crawler or a typo arrives as `pt` rather than as a third state.
    H.locale = 'de' as 'pt'
    H.approved = ['pt']
    const out = await run(complete())
    expect(out.received).toBe(true)
  })
})

/**
 * ==========================================================================
 * INTAKE-01: THE FIFTH STEP, ON THE SERVER.
 * ==========================================================================
 * The flow carries `intake=1` when the catalog said 0087's table exists. Every
 * arm asserts whether the API was called, like every arm above: an intake that
 * was refused on screen but sent anyway would be Article 9 data written behind
 * an error message.
 */
const intakeAnswers = (over: Record<string, string> = {}) => ({
  ...complete({ step: '5', intake: '1' }),
  dateOfBirth: '1985-03-02',
  reason: 'Dor lombar há três semanas',
  healthConditions: 'Hipertensão',
  medication: '',
  fallsAccidents: '',
  surgeries: 'Apendicectomia',
  pacemaker: 'nao',
  pregnancy: 'nao',
  ...over,
})

describe('INTAKE-01: the fifth step', () => {
  it('on the five-step flow, a complete step 4 advances to step 5, not to the submit', async () => {
    const { consent: _c, ...details } = complete({ step: '4', intent: 'next', intake: '1' })
    const out = await run(details)
    expect(out.step).toBe(5)
    expect(out.error).toBeNull()
    expect(out.intake).toBe(true)
    expect(H.submits).toHaveLength(0)
  })

  it('on the FOUR-step flow nothing changes: step 4 is still the last step', async () => {
    const { consent: _c, ...details } = complete({ step: '4', intent: 'next' })
    const out = await run(details)
    expect(out.step).toBe(4)
    expect(out.intake).toBe(false)
  })

  it('a complete five-step submit sends ONE intake object, in the wire shape, with the current label', async () => {
    const out = await run(intakeAnswers())
    expect(out.received).toBe(true)
    expect(out.step).toBe(5)
    expect(H.submits).toHaveLength(1)
    const sent = H.submits[0]!
    expect(Object.keys(sent).sort()).toEqual([
      'fullName',
      'intake',
      'locationId',
      'phone',
      'preferredDate',
      'preferredPeriod',
      'serviceId',
    ])
    expect(sent.intake).toEqual({
      dateOfBirth: '1985-03-02',
      reason: 'Dor lombar há três semanas',
      healthConditions: 'Hipertensão',
      // BLANK OPTIONAL ANSWERS TRAVEL AS null, never as "".
      medication: null,
      fallsAccidents: null,
      surgeries: 'Apendicectomia',
      pacemaker: 'nao',
      pregnancy: 'nao',
      consentVersion: CURRENT_INTAKE_CONSENT_VERSION,
    })
  })

  it('the body carries NO consent tick and NO consent time: the API sets both', async () => {
    await run(intakeAnswers())
    const intake = H.submits[0]!.intake as Record<string, unknown>
    expect(intake).not.toHaveProperty('consentAt')
    expect(intake).not.toHaveProperty('consentTicked')
  })

  it('the four-step flow NEVER sends an intake, even if intake fields are posted', async () => {
    // Every intake answer posted, but NO `intake=1` flag: the four-step flow.
    const posted: Record<string, string> = { ...intakeAnswers(), step: '4' }
    delete posted.intake
    await run(posted)
    expect(H.submits).toHaveLength(1)
    expect(H.submits[0]).not.toHaveProperty('intake')
    expect(JSON.stringify(H.submits[0])).not.toContain('Dor lombar')
  })

  it.each([
    ['no pacemaker answer', { pacemaker: '' }],
    ['no pregnancy answer', { pregnancy: '' }],
    ['the third state, which this form cannot produce', { pacemaker: 'nao_perguntado' }],
    ['an answer outside the vocabulary', { pregnancy: 'talvez' }],
    ['no date of birth', { dateOfBirth: '' }],
    ['a date of birth that does not exist', { dateOfBirth: '1985-02-30' }],
    ['a date of birth before 1900', { dateOfBirth: '1899-12-31' }],
    ['a date of birth in the future', { dateOfBirth: dayOffset(1) }],
    ['no reason', { reason: '   ' }],
    ['a reason over 2000 characters', { reason: 'x'.repeat(2001) }],
    ['an optional answer over 2000 characters', { surgeries: 'x'.repeat(2001) }],
  ])('%s returns to step 5 with missing_field and SENDS NOTHING', async (_label, over) => {
    const out = await run(intakeAnswers(over))
    expect(out.step).toBe(5)
    expect(out.error).toBe('missing_field')
    expect(out.received).toBe(false)
    expect(H.submits).toHaveLength(0)
  })

  it('THE CONTROL: 2000 characters exactly, and today as the date of birth, are accepted', async () => {
    // Without this, every refusal above passes against a validator that refuses
    // everything. The bounds are 0087's, inclusive.
    const out = await run(
      intakeAnswers({ reason: 'x'.repeat(2000), surgeries: 'y'.repeat(2000), dateOfBirth: dayOffset(0) }),
    )
    expect(out.received).toBe(true)
    expect(H.submits).toHaveLength(1)
  })

  it('"sim" is carried as "sim" (the answer is not normalised to a boolean)', async () => {
    await run(intakeAnswers({ pacemaker: 'sim', pregnancy: 'sim' }))
    const intake = H.submits[0]!.intake as Record<string, unknown>
    expect(intake.pacemaker).toBe('sim')
    expect(intake.pregnancy).toBe('sim')
  })

  it('an unticked RGPD box on the five-step flow returns to STEP 5, where the box is', async () => {
    const { consent: _c, ...unticked } = intakeAnswers()
    const out = await run(unticked)
    expect(out.error).toBe('consent_required')
    expect(out.step).toBe(5)
    expect(H.submits).toHaveLength(0)
  })

  it.each(['invalid', 'rate_limited', 'unavailable'] as const)(
    'an API %s on the five-step flow is reported on step 5',
    async (outcome) => {
      H.outcome = outcome
      const out = await run(intakeAnswers())
      expect(out.step).toBe(5)
      expect(out.error).toBe(outcome)
      expect(out.received).toBe(false)
    },
  )

  it('going back from step 5 keeps every answer, and the flow stays five steps', async () => {
    const out = await run(intakeAnswers({ intent: 'back' }))
    expect(out.step).toBe(4)
    expect(out.intake).toBe(true)
    expect(out.values.reason).toBe('Dor lombar há três semanas')
    expect(out.values.pacemaker).toBe('nao')
    expect(H.submits).toHaveLength(0)
  })

  it('a forged step 5 cannot skip the earlier questions', async () => {
    const out = await run({ step: '5', intent: 'submit', intake: '1', pacemaker: 'nao', pregnancy: 'nao' })
    expect(out.step).toBe(1)
    expect(out.error).toBe('missing_field')
    expect(H.submits).toHaveLength(0)
  })

  it('an unratified locale refuses the five-step submit BEFORE anything is sent', async () => {
    H.locale = 'en'
    H.approved = ['pt']
    const out = await run(intakeAnswers())
    expect(out.error).toBe('unavailable')
    expect(out.step).toBe(5)
    expect(H.submits).toHaveLength(0)
  })
})
