import { describe, expect, it } from 'vitest'

import pt from '../../../../packages/i18n/src/portal/strings.pt.json'
import en from '../../../../packages/i18n/src/portal/strings.en.json'
import { guestConfirmationCopy, isGuestConfirmationCopyReady } from './commitment-copy'

/**
 * GUEST-05 — the confirmation copy is a COMMITMENT. It is now WRITTEN, and §1
 * below was INVERTED on the day it landed.
 *
 * WHAT §1 USED TO SAY, because the inversion is the point of the design rather
 * than a tidy-up: it asserted both keys were EMPTY, which was the true and
 * expected state while JP had not written them. That made the transition
 * impossible to make quietly — landing the copy turned three assertions red
 * across two files, and the red was the instruction to come here and invert
 * them. The same shape `patient-linkage.db.test.ts` used for the phone defect:
 * pin what is true now, and say in the test how to flip it.
 *
 * §2 IS UNCHANGED AND STILL THE POINT. It drives the guard with explicit EMPTY
 * sources rather than with the dictionary, so it goes on proving that unwritten
 * copy fails loudly — for the next screen that needs a commitment, and for the
 * case where somebody empties these keys again.
 */

describe('§1 — the keys are WRITTEN, in both locales, and pt is JP\'s VERBATIM', () => {
  // JP's words, character for character, dispatched 2026-08-16. Pinned here so
  // a later "tidy-up" of the semicolon, the "a mesma" phrasing or the accents
  // has to break a test that says why: this is commitment copy the clinic
  // stands behind, not microcopy this repo may edit.
  const JP_TITLE = 'Recebemos a sua solicitação e a mesma encontra-se em análise'
  const JP_BODY =
    'O agendamento ainda não foi confirmado; entraremos em contacto assim que estiver na nossa agenda.'

  it('pt-PT carries JP\'s two strings exactly', () => {
    expect(pt.guest.confirmation_title).toBe(JP_TITLE)
    expect(pt.guest.confirmation_body).toBe(JP_BODY)
  })

  it('the body still says the appointment is NOT confirmed', () => {
    // The single most important property of this screen, asserted on its
    // meaning rather than only on its bytes. R-GUEST-1: a guest booking is
    // always a request. Copy that ever reads as a confirmation would make the
    // screen contradict the entire flow behind it.
    expect(pt.guest.confirmation_body).toContain('ainda não foi confirmado')
  })

  it('en carries the same two keys, written', () => {
    // EN is not patient-facing commitment copy in production; it mirrors the
    // meaning so the dictionary has no holes.
    expect(en.guest.confirmation_title.trim()).not.toBe('')
    expect(en.guest.confirmation_body.trim()).not.toBe('')
    expect(en.guest.confirmation_body).toContain('not yet confirmed')
  })
})

describe('§2 — unwritten copy FAILS LOUDLY, it never renders blank', () => {
  const EMPTY = { confirmation_title: '', confirmation_body: '' }

  it('is not ready', () => {
    expect(isGuestConfirmationCopyReady(EMPTY)).toBe(false)
  })

  it('THROWS rather than returning empty strings', () => {
    // The whole point. A function returning { title: '', body: '' } would render
    // a blank screen to somebody who has just given the clinic their telephone
    // number, and nothing anywhere would report it.
    expect(() => guestConfirmationCopy(EMPTY)).toThrow(/confirmation_title/)
  })

  it('WHITESPACE IS NOT COPY', () => {
    // A space in a JSON string is the obvious way to make the guard shut up.
    const blank = { confirmation_title: ' ', confirmation_body: '\n' }
    expect(isGuestConfirmationCopyReady(blank)).toBe(false)
    expect(() => guestConfirmationCopy(blank)).toThrow()
  })

  it('HALF-written is not written', () => {
    // A title with no body is a screen that says "Pedido recebido" and then
    // nothing about what happens next — which is precisely the commitment that
    // was withheld.
    expect(
      isGuestConfirmationCopyReady({ confirmation_title: 'Recebido', confirmation_body: '' }),
    ).toBe(false)
    expect(
      isGuestConfirmationCopyReady({ confirmation_title: '', confirmation_body: 'Ligamos.' }),
    ).toBe(false)
  })
})

describe('§3 — NEGATIVE ARM: filled copy is accepted and returned unchanged', () => {
  // Without this, a guard that refused EVERYTHING would pass every assertion
  // above and the form would be permanently dead once the copy landed.
  const FILLED = {
    confirmation_title: 'Pedido recebido',
    confirmation_body: 'A clínica entrará em contacto.',
  }

  it('is ready', () => {
    expect(isGuestConfirmationCopyReady(FILLED)).toBe(true)
  })

  it('returns the two strings VERBATIM', () => {
    expect(guestConfirmationCopy(FILLED)).toEqual({
      title: 'Pedido recebido',
      body: 'A clínica entrará em contacto.',
    })
  })
})
