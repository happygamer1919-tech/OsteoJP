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

import { createHash } from 'node:crypto'

import en from '../../../../packages/i18n/src/portal/strings.en.json'
import pt from '../../../../packages/i18n/src/portal/strings.pt.json'
import staffEn from '../../../../packages/i18n/src/strings.en.json'
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
  // `intent`, `step` and `intake` are the wizard's own controls, not answers.
  const fields = [...new Set(named)].filter(
    (n) => !['intent', 'step', 'intake'].includes(n as string),
  )

  it('exactly six inputs, the ruled optional email, the consent box, and INTAKE-01\'s eight step-5 answers', () => {
    // The closed list from the ruling: name, mobile, service, clinic, preferred
    // date, preferred period. INTAKE-01 adds JP's intake list (SPEC section 3),
    // rendered only on the five-step flow. Anything else has to be argued for here.
    //
    // `email` WAS ARGUED FOR, AND RULED: strategy S-1004-A R40 (2026-10-04), "Add
    // an optional email field to the public form". It was on the forbidden list
    // below until that ruling, and it is the only name that left it.
    expect(fields.sort()).toEqual([
      'consent',
      'dateOfBirth',
      'email',
      'fallsAccidents',
      'fullName',
      'healthConditions',
      'locationId',
      'medication',
      'pacemaker',
      'phone',
      'preferredDate',
      'preferredPeriod',
      'pregnancy',
      'reason',
      'serviceId',
      'surgeries',
    ])
  })

  it.each(['nif', 'birth', 'nascimento', 'morada', 'address', 'notes', 'observ'])(
    'carries no %s field',
    (forbidden) => {
      // PL-20 (no NIF) and R-GUEST-2 (nothing clinical, nothing beyond the
      // minimum). A public form is the worst place to collect anything the
      // clinic does not need before it has spoken to the person.
      expect(FORM.toLowerCase()).not.toContain(`name="${forbidden}`)
    },
  )

  it('THE BROWSER RUNS THE SERVER\'S RULE AND NOT THE DATABASE DRIVER: the helper imports the package\'s dependency-free entry, and the form never imports its root', () => {
    const helper = code(join(HERE, 'email-field.ts'))
    expect(helper.match(/^import .*$/gm)).toEqual(["import { parseGuestEmail } from '@osteojp/db/guest-email'"])
    expect(helper).toContain("return parseGuestEmail(typed).ok ? '' : message")
    expect(helper).toContain('field.setCustomValidity(guestEmailFieldMessage(field.value, message))')
    // The root of @osteojp/db in a client component is the `postgres` driver in the browser bundle.
    expect(FORM).toContain("import { syncEmailFieldValidity } from './email-field'")
    expect(FORM).not.toMatch(/from '@osteojp\/db'/)
    // The entry itself imports nothing at all.
    const rule = readFileSync(join(HERE, '..', '..', '..', '..', 'packages', 'db', 'src', 'guest-email.ts'), 'utf8')
    expect(rule).not.toMatch(/^import /m)
    const pkg = JSON.parse(readFileSync(join(HERE, '..', '..', '..', '..', 'packages', 'db', 'package.json'), 'utf8')) as { exports: Record<string, string> }
    expect(pkg.exports['./guest-email']).toBe('./src/guest-email.ts')
  })

  it('R40: ONE email input, optional, with the ruling\'s own label and hint and no other copy', () => {
    // From `<Input` to the `/>` on its own line: the element carries arrow
    // functions now, so "up to the next >" would stop inside it.
    const inputs = [...FORM.matchAll(/<Input\n\s+name="email"\n[\s\S]*?\n\s+\/>/g)].map((m) => m[0])
    expect(inputs).toHaveLength(1)
    expect(FORM.match(/name="email"/g)).toHaveLength(1)
    // OPTIONAL: the input carries no `required`, and neither does its Field.
    expect(inputs[0]).not.toContain('required')
    // NOT THE BROWSER'S EMAIL CHECK, which refuses `coração@exemplo.pt` and admits
    // `a@b`. The keyboard and the autofill stay; the SHARED rule decides.
    expect(inputs[0]).toContain('type="text"')
    expect(FORM).not.toContain('type="email"')
    expect(inputs[0]).toContain('inputMode="email"')
    expect(inputs[0]).toContain('autoComplete="email"')
    // THE VALIDITY IS SET FROM THE LIVE VALUE in three places: on mount and re-render,
    // on every input event, and on every click inside the form before the browser validates.
    expect(inputs[0]).toContain('ref={(el) => syncEmailFieldValidity(el, s.guest.error_invalid)}')
    expect(inputs[0]).toContain('onInput={(e) => syncEmailFieldValidity(e.currentTarget, s.guest.error_invalid)}')
    expect(FORM).toMatch(
      /<form\n\s+action=\{formAction\}[\s\S]{0,200}onClickCapture=\{\(e\) => \{\n\s+const field = e\.currentTarget\.elements\.namedItem\('email'\)\n\s+syncEmailFieldValidity\(field instanceof HTMLInputElement \? field : null, s\.guest\.error_invalid\)/,
    )
    expect(FORM.match(/setCustomValidity/g)).toBeNull()
    expect(inputs[0]).toContain('maxLength={GUEST_EMAIL_INPUT_MAX}')
    expect(FORM).toContain('<Field label={s.guest.email_label} helperText={s.guest.email_hint}>')
    // THE WORDS ARE THE RULING'S, character for character, and the English is
    // written from them. Patient-facing copy is never authored in a component.
    expect(pt.guest.email_label).toBe('Email (opcional)')
    expect(pt.guest.email_hint).toBe('Para receber a confirmação da marcação')
    expect(en.guest.email_label).toBe('Email (optional)')
    expect(en.guest.email_hint).toBe('To receive your booking confirmation')
  })
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

  it('every guest string is written, with no exceptions', () => {
    // INVERTED 2026-08-16 (GUEST-05). This read `toEqual(['confirmation_body',
    // 'confirmation_title'])` while JP's commitment copy was outstanding, so
    // landing it turned this red on purpose - the two keys were the only
    // permitted blanks and now there are none. A blank string on this screen is
    // a patient-facing hole from here on.
    const empty = Object.entries(pt.guest)
      .filter(([, v]) => String(v).trim() === '')
      .map(([k]) => k)
      .sort()
    expect(empty).toEqual([])
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

describe('§8 INTAKE-01: the fifth step', () => {
  const stepFive = FORM.slice(FORM.indexOf('{step === 5 && ('), FORM.indexOf('{rgpdPanel}\n          </>'))

  it('the slice really is step 5 (guards a vacuous pass)', () => {
    expect(FORM.indexOf('{step === 5 && (')).toBeGreaterThan(-1)
    expect(stepFive).toContain('name="pacemaker"')
    expect(stepFive.length).toBeLessThan(FORM.length / 2)
  })

  it('renders only when the catalog said the intake is enabled', () => {
    expect(PAGE).toContain('intakeEnabled={catalog.intakeEnabled === true}')
    expect(FORM).toContain('intake: intakeEnabled')
    expect(FORM).toContain('guestTotalSteps(state.intake)')
  })

  it('the date of birth is a NATIVE date input, with bounds from the server', () => {
    expect(stepFive).toMatch(/type="date"\s+name="dateOfBirth"\s+min=\{dobMin\}\s+max=\{dobMax\}/)
  })

  it.each(['pacemaker', 'pregnancy'])('%s: two required radios, sim and nao, NEITHER pre-checked', (q) => {
    // Ruling 2. A default of "nao" would answer a safety question for the visitor.
    for (const v of ['sim', 'nao']) {
      const re = new RegExp(
        `name="${q}"\\s+value="${v}"\\s+required\\s+defaultChecked=\\{values\\.${q} === '${v}'\\}`,
      )
      expect(stepFive).toMatch(re)
    }
    expect(stepFive).not.toMatch(new RegExp(`name="${q}"[^>]*\\schecked`))
  })

  it('the form can never produce the third state', () => {
    // `nao_perguntado` exists in storage for rows from other routes; this door
    // has no control, value or default that could send it.
    expect(FORM).not.toContain('nao_perguntado')
    expect(ACTIONS).not.toContain('nao_perguntado')
  })

  it('both answers are required ON THE SERVER, not only by the browser', () => {
    expect(ACTIONS).toContain(
      'isGuestIntakeAnswer(values.pacemaker) && isGuestIntakeAnswer(values.pregnancy)',
    )
  })

  it('the RGPD panel sits on step 5 on the five-step flow, and carries the intake consent', () => {
    expect(FORM).toContain('{!state.intake && rgpdPanel}')
    expect(FORM).toContain('s.guest.intake_consent_body')
    expect(stepFive.length).toBeGreaterThan(0)
  })

  it('Back never validates in the browser either (formNoValidate)', () => {
    // With JavaScript off, a required consent box or radio pair on the current
    // step would otherwise block the Back press itself.
    expect(FORM).toMatch(/name="intent" value="back" variant="secondary" formNoValidate/)
  })

  it('the submit records the CURRENT consent label and never a client timestamp', () => {
    expect(ACTIONS).toContain('consentVersion: CURRENT_INTAKE_CONSENT_VERSION')
    expect(ACTIONS).not.toMatch(/consentAt|consentTicked|consent_at/)
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

  it('the pre-checked matcher would catch a defaulted "nao"', () => {
    expect('name="pacemaker" value="nao" checked').toMatch(/name="pacemaker"[^>]*\schecked/)
  })
})

/**
 * THE SENTENCE ABOUT WHAT THE CONTACTS ARE USED FOR. Owner-approved copy (his
 * "yes" of 2026-10-05 to the wording proposed under strategy gate G5), so it is
 * pinned word for word in both languages: an edit to either string is a new
 * decision, and this test is where it has to be made.
 */
describe('the contact-use sentence: owner-approved copy, its own key, outside the consent', () => {
  it('BOTH STRINGS, WORD FOR WORD', () => {
    expect(pt.guest.contact_use).toBe(
      'Os contactos que indicar (telemóvel e, se o fornecer, email) são usados para confirmar e gerir a sua marcação.',
    )
    expect(en.guest.contact_use).toBe(
      'The contact details you give (mobile and, if provided, email) are used to confirm and manage your booking.',
    )
  })

  it('the form renders it ONCE, from its own key, after the email field and before the consent panel', () => {
    expect(FORM.split('{s.guest.contact_use}')).toHaveLength(2)
    const email = FORM.indexOf('name="email"')
    const sentence = FORM.indexOf('{s.guest.contact_use}')
    const panel = FORM.indexOf('{!state.intake && rgpdPanel}')
    expect(email).toBeGreaterThan(0)
    expect(sentence).toBeGreaterThan(email)
    expect(panel).toBeGreaterThan(sentence)
    // NOT INSIDE THE CONSENT PANEL: the panel's own markup never names the key.
    const panelSource = FORM.slice(FORM.indexOf('const rgpdPanel = ('), FORM.indexOf('if (state.received'))
    expect(panelSource.length).toBeGreaterThan(200)
    expect(panelSource).not.toContain('contact_use')
    // And it is authored nowhere but the dictionary.
    expect(FORM).not.toContain('são usados para confirmar')
    expect(FORM).not.toContain('are used to confirm')
  })

  it('THE CONSENT TEXTS ARE BYTE-IDENTICAL TO WHAT THEY WERE: the sentence was added beside them, never to them', () => {
    // sha256 of each string as it stands on main at f475b14b (2026-10-05). The RGPD
    // body is the text `rgpd-v1-2026` names in every recorded acceptance
    // (apps/web/lib/patients/rgpd-acceptance.ts), and apps/web/lib/clinical/consent.test.ts
    // pins its Portuguese word for word; the intake body is pinned to its own label by
    // intake-consent-pin.test.ts. These four are here so that THIS change, which adds a
    // sentence about data use a few lines away, is provably not an edit to either.
    const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
    expect(sha(staffPt['clinical.consent.rgpd.label'])).toBe('69696b1d58af354ad2cae96b8d02192371536fa23c576975bf9e5df126fb91e3')
    expect(sha(staffPt['clinical.consent.rgpd.body'])).toBe('75be41bce70c2e9d30e87a8075485f66783b5695ffa3ebae98f473d453c99e02')
    expect(sha(staffEn['clinical.consent.rgpd.label'])).toBe('eafa24d51dad84dc4c37784fb10038906f1d8b174d9fdacf47bcbdb38ede20cd')
    expect(sha(staffEn['clinical.consent.rgpd.body'])).toBe('9a63e66109b7015499fc922c2c11612507e4651a48545cefd0bc9d3200356da9')
    // The sentence is not a fragment of any consent text, in either language.
    for (const body of [staffPt['clinical.consent.rgpd.body'], staffEn['clinical.consent.rgpd.body'], pt.guest.intake_consent_body, en.guest.intake_consent_body]) {
      expect(body).not.toContain('confirmar e gerir')
      expect(body).not.toContain('confirm and manage')
    }
  })
})
