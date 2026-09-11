/**
 * INTAKE-01 / WF-19 - THE CONSENT TEXT IS PINNED TO ITS VERSION LABEL.
 *
 * WHAT THE LABEL IS. Every intake row stores `consent_version`, the label of the
 * consent text the visitor was shown (the terms mechanism, reused: a document's
 * identity, never its text). The portal sends CURRENT_INTAKE_CONSENT_VERSION.
 *
 * THE HAZARD. The text is an i18n string inside this repository, so it can be
 * EDITED UNDER an unchanged label: a one-word change and every earlier row claims
 * consent to wording nobody saw (SPEC-guest-clinical-intake section 11.2). A
 * guard must watch the thing that changes, which is the body, not the constant.
 *
 * SO THE BODY IS PINNED BY SHA-256, IN BOTH LOCALES, TO THE CURRENT LABEL. To
 * change the text: add a NEW label at the end of INTAKE_CONSENT_VERSIONS
 * (packages/i18n/src/intake-consent.ts), add its two hashes here, and never edit
 * an old label's entry. Editing the text alone turns this red, which is the
 * point.
 *
 * NEGATIVE CONTROLS at the bottom prove the pin can fail.
 */
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'
import {
  CURRENT_INTAKE_CONSENT_VERSION,
  INTAKE_CONSENT_VERSIONS,
  type IntakeConsentVersion,
} from '@osteojp/i18n'

import en from '../../../../packages/i18n/src/portal/strings.en.json'
import pt from '../../../../packages/i18n/src/portal/strings.pt.json'

/**
 * One entry per label, ever. A label whose text has been superseded keeps its
 * entry: it records what that label meant. Typed as a Record over the labels, so
 * a new label without hashes does not compile.
 */
const PINNED: Record<IntakeConsentVersion, { pt: string; en: string }> = {
  'rgpd-intake-2026-09-11': {
    pt: 'bc237e31a70eba8c2022ea922153bd427506c46d93f18c2098b72b96d2920d03',
    en: 'e7bcebbc61b3b1c863eb9ecde66eba2edee0bb83229f893a71bd0d899289b561',
  },
}

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const bodies = { pt: pt.guest.intake_consent_body, en: en.guest.intake_consent_body }

describe('the intake consent body is pinned to CURRENT_INTAKE_CONSENT_VERSION', () => {
  it('every pinned hash is a real sha-256, and every label has one', () => {
    for (const label of INTAKE_CONSENT_VERSIONS) {
      const pin = PINNED[label]
      expect(pin, `no pin for ${label}`).toBeDefined()
      expect(pin.pt).toMatch(/^[0-9a-f]{64}$/)
      expect(pin.en).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it.each(['pt', 'en'] as const)('the %s body is non-empty and hashes to the current label', (locale) => {
    const body = bodies[locale]
    // Refuse an empty text before hashing it: the hash of "" is a real hash.
    expect(body.trim().length).toBeGreaterThan(200)
    expect(sha256(body)).toBe(PINNED[CURRENT_INTAKE_CONSENT_VERSION][locale])
  })

  it('the current label is the LAST one (the rule the API and portal share)', () => {
    expect(CURRENT_INTAKE_CONSENT_VERSION).toBe(
      INTAKE_CONSENT_VERSIONS[INTAKE_CONSENT_VERSIONS.length - 1],
    )
  })

  it('the text states the seven-day deletion, in both locales (JP\'s ruling, SPEC section 8)', () => {
    expect(bodies.pt).toContain('sete dias')
    expect(bodies.en).toContain('seven days')
  })

  it('no em or en dash in either body', () => {
    for (const body of Object.values(bodies)) {
      expect(body).not.toMatch(/[\u2013\u2014]/)
    }
  })
})

describe('NEGATIVE CONTROLS: the pin fails on the edits it exists to catch', () => {
  it('a one-word edit under the same label changes the hash', () => {
    const edited = bodies.pt.replace('sete dias', 'trinta dias')
    expect(edited).not.toBe(bodies.pt)
    expect(sha256(edited)).not.toBe(PINNED[CURRENT_INTAKE_CONSENT_VERSION].pt)
  })

  it('a whitespace-only edit changes the hash too', () => {
    expect(sha256(`${bodies.en} `)).not.toBe(PINNED[CURRENT_INTAKE_CONSENT_VERSION].en)
  })

  it('the pt pin does not match the en body (the locales are pinned separately)', () => {
    expect(sha256(bodies.en)).not.toBe(PINNED[CURRENT_INTAKE_CONSENT_VERSION].pt)
  })
})
