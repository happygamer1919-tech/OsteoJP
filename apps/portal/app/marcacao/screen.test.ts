/**
 * GUEST-04 — what the public form must show, and must never carry.
 *
 * STATIC, like `auth/login/screens.test.ts` next door, and for the same stated
 * reason: this app has no React testing library and adding one is an owner
 * decision rather than a test-writing convenience. So these assert over the
 * SOURCE and the DICTIONARY. They prove the copy exists, is referenced by the
 * screen that must show it, and that the forbidden things are absent. They do
 * not prove pixels — WF-03 rules that a patient-visible loop closes on the
 * owner's deployed screen, so the visual proof was never going to come from
 * here.
 *
 * NEGATIVE ARMS at the bottom prove the matchers can fail.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import pt from '../../../../packages/i18n/src/portal/strings.pt.json'
import staffPt from '../../../../packages/i18n/src/strings.pt.json'

const HERE = __dirname

/** Comment-stripped, because this file's whole job is to tell a rendered string
 *  from a discussed one. The design comments here name most of what is
 *  forbidden below. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const FORM = code(join(HERE, 'GuestBookingForm.tsx'))
const PAGE = code(join(HERE, 'page.tsx'))
const ACTIONS = code(join(HERE, 'actions.ts'))
const PROXY = code(join(HERE, '..', '..', 'proxy.ts'))

describe('§1 — the form collects R-GUEST-2 + the ruling, and NOTHING else', () => {
  const named = [...FORM.matchAll(/name="([a-zA-Z]+)"/g)].map((m) => m[1])
  const fields = [...new Set(named)].filter(
    (n) => !['intent', 'step'].includes(n as string),
  )

  it('exactly six inputs, plus the consent box', () => {
    // The closed list from the ruling: name, mobile, service, clinic, preferred
    // date, preferred period. A seventh field has to be argued for here.
    expect(fields.sort()).toEqual([
      'consent',
      'fullName',
      'locationId',
      'phone',
      'preferredDate',
      'preferredPeriod',
      'serviceId',
    ])
  })

  it.each(['nif', 'birth', 'nascimento', 'email', 'morada', 'address', 'notes', 'observ'])(
    'carries no %s field',
    (forbidden) => {
      // PL-20 (no NIF) and R-GUEST-2 (nothing clinical, nothing beyond the
      // minimum). A public form is the worst place to collect anything the
      // clinic does not need before it has spoken to the person.
      expect(FORM.toLowerCase()).not.toContain(`name="${forbidden}`)
    },
  )
})

describe('§2 — NO AVAILABILITY IS DISCLOSED (MN-27, MN-28)', () => {
  it.each(['therapist', 'practitioner', 'terapeuta', 'slot', 'availability', 'disponib'])(
    'the form never mentions %s',
    (word) => {
      // Option A: no roster, no slot grid, no confirmation that any time is
      // free. If a future edit adds a therapist step, it has to delete this
      // assertion, and deleting it is a decision somebody makes deliberately.
      expect(FORM.toLowerCase()).not.toContain(word)
    },
  )

  it('the page fetches ONLY the public catalog', () => {
    expect(PAGE).toContain('fetchPublicCatalog')
    expect(PAGE).not.toContain('getOpenSlots')
    expect(PAGE).not.toContain('getBookableTherapists')
  })
})

describe('§3 — the RGPD consent is VERBATIM and is not authored here', () => {
  it('the page resolves both ratified keys', () => {
    expect(PAGE).toContain("'clinical.consent.rgpd.label'")
    expect(PAGE).toContain("'clinical.consent.rgpd.body'")
  })

  it('both ratified strings exist and are substantial', () => {
    expect(staffPt['clinical.consent.rgpd.label']).toBeTruthy()
    // The body is the full RGPD paragraph a patient signs on the ficha. A short
    // value here would mean somebody replaced it with a summary.
    expect(staffPt['clinical.consent.rgpd.body'].length).toBeGreaterThan(400)
  })

  it('the consent text is NOT copied into this screen', () => {
    // Copying it would be an adaptation waiting to happen: two texts that must
    // stay identical, in two files, with only one of them reviewed.
    const fragment = staffPt['clinical.consent.rgpd.body'].slice(0, 60)
    expect(FORM).not.toContain(fragment)
    expect(FORM).toContain('rgpdBody')
  })

  it('the acknowledgement is REQUIRED in the markup AND on the server', () => {
    expect(FORM).toMatch(/type="checkbox"[\s\S]{0,200}required/)
    // The attribute is a hint to a browser. This is the check that binds.
    expect(ACTIONS).toContain("consent_required")
    expect(ACTIONS).toMatch(/if \(!consent\)/)
  })
})

describe('§4 — the confirmation renders JP\'s words or nothing', () => {
  const confStart = FORM.indexOf('state.received')
  const confEnd = FORM.indexOf('return (\n    <div className="rounded-xl')
  const confirmation = FORM.slice(confStart, confEnd)

  it('the slice really is the confirmation branch (guards a vacuous pass)', () => {
    // If either anchor stops matching, `slice` silently returns most of the file
    // and every assertion below passes on the wrong text.
    expect(confStart).toBeGreaterThan(-1)
    expect(confEnd).toBeGreaterThan(confStart)
    expect(confirmation.length).toBeLessThan(FORM.length / 4)
  })

  it('renders the injected copy and no literal of its own', () => {
    expect(confirmation).toContain('confirmationCopy.title')
    expect(confirmation).toContain('confirmationCopy.body')
  })

  it.each(['Pedido recebido', 'Obrigado', 'entraremos em contacto', 'brevemente'])(
    'never hardcodes %s',
    (phrase) => {
      expect(FORM).not.toContain(phrase)
    },
  )

  it('an empty copy renders the unavailable banner, never a blank screen', () => {
    expect(confirmation).toContain('!confirmationCopy')
    expect(confirmation).toContain('s.guest.error_unavailable')
  })
})

describe('§5 — the dictionary and the screen agree', () => {
  const referenced = [...FORM.matchAll(/s\.guest\.([a-z_]+)/g)].map((m) => m[1] as string)

  it('the screen references at least the steps and the submit', () => {
    // Guards a vacuous pass: an empty `referenced` would make the next
    // assertion trivially true.
    expect(referenced.length).toBeGreaterThanOrEqual(10)
  })

  it.each([...new Set(referenced)])('s.guest.%s exists in pt-PT', (key) => {
    // A typo renders `undefined` on a public screen and nothing else notices.
    expect(pt.guest).toHaveProperty(key)
  })

  it('every guest string is written EXCEPT the two commitment keys', () => {
    const empty = Object.entries(pt.guest)
      .filter(([, v]) => String(v).trim() === '')
      .map(([k]) => k)
      .sort()
    expect(empty).toEqual(['confirmation_body', 'confirmation_title'])
  })
})

describe('§6 — the route is public, deliberately', () => {
  it('proxy.ts lists /marcacao among the paths reachable without a session', () => {
    expect(PROXY).toContain("'/marcacao'")
  })

  it('and it sits OUTSIDE /portal', () => {
    // Everything under /portal is a signed-in patient's own record. This page
    // belongs to somebody who has none, and putting it there would make the
    // prefix stop meaning anything.
    expect(HERE).not.toContain(join('app', 'portal'))
  })
})

describe('§7 — NEGATIVE ARMS: every matcher above can fail', () => {
  it('the forbidden-word matcher would catch a therapist step', () => {
    expect('const therapist = 1'.toLowerCase()).toContain('therapist')
  })

  it('the verbatim matcher would catch a copied consent paragraph', () => {
    const fragment = staffPt['clinical.consent.rgpd.body'].slice(0, 60)
    expect(`<p>${fragment}</p>`).toContain(fragment)
  })

  it('the field-set matcher would catch a NIF input', () => {
    expect('<input name="nif" />'.toLowerCase()).toContain('name="nif')
  })
})
