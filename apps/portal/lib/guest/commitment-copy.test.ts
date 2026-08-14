import { describe, expect, it } from 'vitest'

import pt from '../../../../packages/i18n/src/portal/strings.pt.json'
import en from '../../../../packages/i18n/src/portal/strings.en.json'
import { guestConfirmationCopy, isGuestConfirmationCopyReady } from './commitment-copy'

/**
 * GUEST-04 — the confirmation copy is a COMMITMENT, it is unwritten, and the
 * code must not paper over that.
 *
 * WHY THESE TESTS PASS TODAY RATHER THAN FAILING. The unwritten state is the
 * EXPECTED state right now, so the suite asserts the GUARD works, not that the
 * copy exists. Asserting the copy exists would put main permanently red and the
 * red would be read as noise within a day — the failure mode
 * `ACC-skippable-suites-unguarded` is about. The moment JP's words land, §3
 * below starts proving the filled path instead, with no edit: it drives the
 * function with a filled source either way.
 */

describe('§1 — the keys ship EMPTY, in both locales', () => {
  it('pt-PT carries the keys and they are empty', () => {
    // The keys must EXIST — a screen referencing a missing key is a different
    // and worse failure — and they must be empty, because nobody has written
    // them.
    expect(pt.guest).toHaveProperty('confirmation_title')
    expect(pt.guest).toHaveProperty('confirmation_body')
    expect(pt.guest.confirmation_title).toBe('')
    expect(pt.guest.confirmation_body).toBe('')
  })

  it('en carries the same two keys, also empty', () => {
    expect(en.guest.confirmation_title).toBe('')
    expect(en.guest.confirmation_body).toBe('')
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
