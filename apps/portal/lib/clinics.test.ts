import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PUBLISHED_CLINIC_CARDS,
  PUBLISHED_CLINIC_PHONES,
  clinicCardFor,
  clinicCardsFor,
  parseClinicPhones,
  phonesOf,
} from './clinics'
import { locationDisplayName, locationShortCode } from './locationLabel'

// PG9 — "the clinic's telephone where the answer is 'call us'".
//
// WHAT THIS GUARDS. Five patient-facing strings end in "Contacte a clínica" and
// for months none of them could be acted on: the numbers were hardcoded inside
// `app/portal/clinics/page.tsx`, reachable only by the Clínicas screen. A
// patient locked out of the portal — no mobile on record, a landline, a number
// shared with a relative — reads that copy on the LOGIN screen, which could not
// see them. Decision D leaves no other door, so "call us" with no number is a
// dead end.
//
// THE THREE THINGS THAT MUST STAY TRUE, and none is checked by the type system:
//   1. the numbers are dialable, so `tel:` works on the phone this is designed for;
//   2. the login screen actually renders them — a shared module nobody imports
//      fixes nothing;
//   3. the copy that promises a telephone still promises one, so the guard and
//      the sentence it serves cannot drift apart.

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Comments stripped before matching source: this file's own headers name the
 *  symbols it asserts on, and matching prose is criterion C on
 *  ACC-vacuous-guard-sweep. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')

describe('PG9 — the clinic telephone is reachable from a locked-out patient', () => {
  it('the published list has a clinic, and every clinic on it a number (guards a vacuous pass)', () => {
    // Without this, every assertion below passes on an empty array — the shape
    // this project has found seven times.
    //
    // R45 (strategy, 2026-10-06): THIS USED TO EXPECT EXACTLY TWO CLINICS. How
    // many there are is no longer this file's to say: the screens read the
    // active locations, and this list is what they fall back on. What it must
    // never be is empty, or a clinic with nothing to call.
    expect(PUBLISHED_CLINIC_CARDS.length).toBeGreaterThan(0)
    for (const c of PUBLISHED_CLINIC_CARDS) expect(c.phone.length, c.name).toBeGreaterThan(0)
    expect(PUBLISHED_CLINIC_PHONES.length).toBeGreaterThanOrEqual(PUBLISHED_CLINIC_CARDS.length)
  })

  it.each(PUBLISHED_CLINIC_PHONES)('$display is dialable E.164', (phone) => {
    // `tel:` needs the E.164 form. A display-only string here would render a
    // link that does nothing when tapped, which is the same dead end one layer
    // down.
    expect(phone.number).toMatch(/^\+351\d{9}$/)
    expect(phone.display.replace(/\s/g, '')).toBe(phone.number.replace('+351', ''))
  })

  it('the LOGIN screen renders them — a shared module nobody imports fixes nothing', () => {
    // R45: the screen renders the numbers IT IS GIVEN, and the page gives it the
    // active locations' numbers or, when those cannot be read or come to none,
    // the published ones. Both halves are pinned: a screen that renders a prop
    // nobody fills, and a page that fills it with a list that can be empty, are
    // the same dead end.
    const login = strip(read('apps/portal/app/auth/login/LoginOtp.tsx'))
    expect(login).toMatch(/phones\.map\(/)
    expect(login).toMatch(/tel:\$\{/)

    const page = strip(read('apps/portal/app/auth/login/page.tsx'))
    expect(page).toMatch(/loadClinicCards\(\)/)
    expect(page).toMatch(/phones=\{livePhones\.length > 0 \? livePhones : PUBLISHED_CLINIC_PHONES\}/)
  })

  it('the error boundaries call the PUBLISHED numbers, which need no read to render', () => {
    // An error boundary renders because a read failed. Its telephone list must
    // not be another read.
    const component = strip(read('apps/portal/components/ClinicPhones.tsx'))
    expect(component).toMatch(/PUBLISHED_CLINIC_PHONES\.map\(/)
    expect(component).not.toMatch(/loadClinicCards|clinics-server/)
  })

  it('the copy that promises a telephone still promises one', () => {
    // If these sentences ever stop saying "contacte a clínica", the numbers
    // beneath them become unexplained furniture — and if they keep saying it
    // while the numbers are removed, the dead end returns. The two must move
    // together, so both are pinned here.
    const pt = JSON.parse(read('packages/i18n/src/portal/strings.pt.json')) as {
      auth: Record<string, string>
    }
    for (const key of ['otp_no_phone', 'otp_landline', 'otp_shared_number']) {
      expect(pt.auth[key], `${key} should still direct the patient to the clinic`).toMatch(
        /contacte a clínica/i,
      )
    }
  })

  it.each([
    'apps/portal/app/portal/account/error.tsx',
    'apps/portal/app/portal/appointments/error.tsx',
    'apps/portal/app/portal/booking/error.tsx',
    'apps/portal/app/portal/dashboard/error.tsx',
    'apps/portal/app/portal/documents/error.tsx',
    'apps/portal/app/portal/forms/error.tsx',
    'apps/portal/app/not-found.tsx',
  ])('%s renders the telephone, not just the sentence promising one', (file) => {
    // PG9: "what happened, what to do, and the clinic's telephone where the
    // answer is 'call us'". The copy in these boundaries now says "contacte a
    // clínica"; WITHOUT THIS ASSERTION the sentence could keep the promise while
    // the number quietly disappeared, which is the dead end the whole change
    // exists to remove.
    // THE JSX USAGE, NOT THE IMPORT, AND THE FIRST VERSION GOT THIS WRONG.
    // `/ClinicPhones/` matched the `import { ClinicPhones } from ...` line, so
    // deleting the actual `<ClinicPhones />` element left the assertion green.
    // Matching a MENTION rather than a USE is the same defect as matching a
    // comment - criterion A on ACC-vacuous-guard-sweep - and it was caught only
    // by running the negative arm.
    expect(strip(read(file))).toMatch(/<ClinicPhones\s*\/?>/)
  })

  it.each([
    'load_appointments_desc',
    'load_documents_desc',
    'load_forms_desc',
    'load_dashboard_desc',
    'load_account_desc',
    '404_body',
  ])('%s still directs the patient to the clinic, in BOTH locales', (key) => {
    // The sentence and the number must move together. Pinned in both locales so
    // a translation cannot silently drop the half that makes the other useful.
    const pt = JSON.parse(read('packages/i18n/src/portal/strings.pt.json')) as {
      errors: Record<string, string>
    }
    const en = JSON.parse(read('packages/i18n/src/portal/strings.en.json')) as {
      errors: Record<string, string>
    }
    expect(pt.errors[key], `pt ${key}`).toMatch(/contacte a clínica/i)
    expect(en.errors[key], `en ${key}`).toMatch(/contact the clinic/i)
  })

  it('the booking boundary directs to the clinic too — it uses its OWN namespace', () => {
    // CAUGHT BY THIS SUITE'S OWN NEGATIVE ARM. booking/error.tsx renders
    // `s.booking.load_error_description`, not `s.errors.*`, so the rewrite that
    // fixed the other five silently skipped it and only the import landed. A
    // second string namespace for the same kind of screen is exactly the drift
    // an enumeration test exists to catch.
    const pt = JSON.parse(read('packages/i18n/src/portal/strings.pt.json')) as {
      booking: Record<string, string>
    }
    const en = JSON.parse(read('packages/i18n/src/portal/strings.en.json')) as {
      booking: Record<string, string>
    }
    expect(pt.booking.load_error_description).toMatch(/contacte a clínica/i)
    expect(en.booking.load_error_description).toMatch(/contact the clinic/i)
  })

  it('the Clínicas screen reads the same source, so the two cannot drift', () => {
    const page = strip(read('apps/portal/app/portal/clinics/page.tsx'))
    // R45: the active locations first, the published list when they cannot be
    // read. A page that only ever showed the published list would pass every
    // other test in this file and never show a new clinic.
    expect(page).toMatch(/\(await loadClinicCards\(\)\) \?\? PUBLISHED_CLINIC_CARDS/)
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/)
    // The numbers must not be re-declared here. Two copies of a phone number is
    // how one of them goes stale silently.
    expect(page).not.toMatch(/\+3519\d{8}/)
  })

  it('both footers name the places they are given, and no string lists them', () => {
    // R45: "footer read from active locations". The footer is the brand and
    // then the names, joined; with no names it is the brand alone.
    const login = strip(read('apps/portal/app/auth/login/LoginOtp.tsx'))
    expect(login).toMatch(/\[s\.common\.app_name, \.\.\.places\]\.join\(' · '\)/)
    const loginPage = strip(read('apps/portal/app/auth/login/page.tsx'))
    expect(loginPage).toMatch(/places=\{clinics \? clinics\.map\(\(c\) => c\.name\) : \[\]\}/)
    const notFound = strip(read('apps/portal/app/not-found.tsx'))
    expect(notFound).toMatch(/await loadClinicCards\(\)/)
    expect(notFound).toMatch(
      /\[s\.common\.app_name, \.\.\.\(clinics \?\? \[\]\)\.map\(\(c\) => c\.name\)\]\.join\(' · '\)/,
    )
    for (const src of [login, loginPage, notFound]) expect(src).not.toMatch(/footer_locations/)
  })

  it('the public form lists the telephones of the clinics it offers', () => {
    const page = strip(read('apps/portal/app/marcacao/page.tsx'))
    expect(page).toMatch(/clinicCardsFor\(catalog\.locations\)/)
    expect(page).toMatch(/reachable\.length > 0 \? reachable : PUBLISHED_CLINIC_CARDS/)
    const form = strip(read('apps/portal/app/marcacao/GuestBookingForm.tsx'))
    expect(form).toMatch(/clinicPhones\.map\(/)
    expect(form).not.toMatch(/PUBLISHED_CLINIC|CLINIC_CONTACTS/)
  })
})

describe('R45 — a clinic card is built from the location the API listed', () => {
  const LV = { id: 'loc-lv', name: 'OsteoJP (LV)', address: 'Rua do registo, 1', phone: '210 000 000' }

  it('a location whose short code is known gets the published details, whole', () => {
    const card = clinicCardFor(LV)
    const published = PUBLISHED_CLINIC_CARDS.find((c) => c.id === 'LV')
    expect(published).toBeDefined()
    // The id is the LOCATION's, everything else is the published entry: the
    // row's own address and telephone are deliberately not mixed in.
    expect(card).toEqual({ ...published, id: 'loc-lv' })
    expect(card.phone.map((p) => p.number)).not.toContain('+351210000000')
    expect(card.weekdayHours).not.toBeNull()
  })

  it('EACH PUBLISHED CLINIC CARRIES ITS OWN DETAILS: the name and the address agree', () => {
    // The name comes from one code-keyed table (the label) and the details from
    // another (this module). Two tables keyed alike can be filled crosswise,
    // and then a clinic is shown with its city and somebody else's telephone.
    // The address line ends in the city, so the two must agree.
    expect(PUBLISHED_CLINIC_CARDS.length).toBeGreaterThan(1)
    for (const card of PUBLISHED_CLINIC_CARDS) {
      expect(card.addressLine, card.id).toContain(card.name)
      expect(card.mapsUrl, card.id).toContain(card.name.replace(/ /g, '+'))
    }
    const names = PUBLISHED_CLINIC_CARDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('the published details need the whole convention, the brand and the code', () => {
    // A label may expand any name that ends in a known code. Contact details
    // may not: a location somebody named after a room must not be handed a
    // real clinic's telephones.
    const published = PUBLISHED_CLINIC_CARDS.find((c) => c.id === 'LV')
    for (const name of ['Sala de testes (LV)', 'Teste (lv)', 'OsteoJP (LV) antiga', '(LV)']) {
      const card = clinicCardFor({ id: 'x', name, address: null, phone: null })
      expect(card.phone, name).toEqual([])
      expect(card.email, name).toBeNull()
      expect(card.weekdayHours, name).toBeNull()
    }
    for (const name of ['OsteoJP (LV)', 'osteojp (lv)', ' OsteoJP(LV) ']) {
      expect(clinicCardFor({ id: 'x', name }).phone, name).toEqual(published?.phone)
    }
  })

  it('the cards keep the order the Clínicas screen has always had, whatever order the API lists them in', () => {
    // The API sorts by STORED name, which puts "OsteoJP (CB)" first. Published
    // clinics come first in the published order, the rest follow in the API's.
    const published = PUBLISHED_CLINIC_CARDS.map((c) => c.name)
    const cards = clinicCardsFor([
      { id: 'a', name: 'Alvalade' },
      { id: 'cb', name: 'OsteoJP (CB)' },
      { id: 'lv', name: 'OsteoJP (LV)' },
      { id: 'z', name: 'OsteoJP (Vila Nova)' },
    ])
    expect(cards.map((c) => c.name)).toEqual([...published, 'Alvalade', 'Vila Nova'])
    expect(cards.map((c) => c.id)).toEqual(['lv', 'cb', 'a', 'z'])
    // And the same order as the fallback, so the page reads the same either way.
    expect(clinicCardsFor([{ id: 'cb', name: 'OsteoJP (CB)' }, { id: 'lv', name: 'OsteoJP (LV)' }]).map((c) => c.name)).toEqual(published)
    expect(clinicCardsFor([])).toEqual([])
  })

  it('a location with no published details is shown from its own row, and nothing is guessed', () => {
    const card = clinicCardFor({
      id: 'loc-new',
      name: 'OsteoJP (Vila Nova)',
      address: '  Rua Direita, 10, 7050-000 Vila Nova ',
      phone: '266 000 111 / +351 912 000 222',
    })
    expect(card).toEqual({
      id: 'loc-new',
      name: 'Vila Nova',
      addressLine: 'Rua Direita, 10, 7050-000 Vila Nova',
      phone: [
        { number: '+351266000111', display: '266 000 111' },
        { number: '+351912000222', display: '912 000 222' },
      ],
      email: null,
      mapsUrl: `https://maps.google.com/?q=${encodeURIComponent('Rua Direita, 10, 7050-000 Vila Nova')}`,
      // NEVER the location's opening hours: a new row carries defaults nobody chose.
      weekdayHours: null,
    })
  })

  it('a location with nothing on file gives a card with a name and no link that goes nowhere', () => {
    // Also the shape an API deployed before R45 answers with: no address, no phone.
    expect(clinicCardFor({ id: 'x', name: 'OsteoJP (ZZ)' })).toEqual({
      id: 'x',
      name: 'OsteoJP (ZZ)',
      addressLine: null,
      phone: [],
      email: null,
      mapsUrl: null,
      weekdayHours: null,
    })
    expect(clinicCardFor({ id: 'x', name: 'Clínica', address: '   ', phone: null }).mapsUrl).toBeNull()
  })

  it.each([
    ['969 472 111', ['+351969472111']],
    ['+351 969 472 111', ['+351969472111']],
    ['00351969472111', ['+351969472111']],
    ['351969472111', ['+351969472111']],
    ['969472111/214191988', ['+351969472111', '+351214191988']],
    ['969 472 111 ou 214 191 988', ['+351969472111', '+351214191988']],
    ['969 472 111; 969 472 111', ['+351969472111']],
    ['+34 912 345 678', ['+34912345678']],
    ['969 472 111 - 214 191 988', ['+351969472111', '+351214191988']],
    ['969 472 111\n214 191 988', ['+351969472111', '+351214191988']],
    // A Portuguese number with its country code is 351 and nine digits. Fewer
    // is a typing slip, and a link to it would dial nothing.
    ['+351 969 472', []],
    ['351 969 472', []],
    ['969 472 111 – 214 191 988', ['+351969472111', '+351214191988']],
    ['969 472 111—214 191 988', ['+351969472111', '+351214191988']],
    // An unspaced hyphen is inside ONE number, never between two.
    ['969-472-111', ['+351969472111']],
    ['00351 969 472 11', []],
    ['+351 969 472 1111', []],
    // Not a number anybody can dial: left out, never a link that does nothing.
    ['ver site', []],
    ['12345', []],
    ['', []],
  ])('reads the telephone field %j as %j', (raw, numbers) => {
    expect(parseClinicPhones(raw).map((p) => p.number)).toEqual(numbers)
  })

  it('null and undefined telephone fields read as no number', () => {
    expect(parseClinicPhones(null)).toEqual([])
    expect(parseClinicPhones(undefined)).toEqual([])
  })

  it('every parsed number is a dialable tel: target, and a foreign one keeps what was typed', () => {
    for (const p of parseClinicPhones('969472111 / +34 912 345 678')) {
      expect(p.number).toMatch(/^\+\d{8,15}$/)
    }
    expect(parseClinicPhones('+34 912 345 678')[0]?.display).toBe('+34 912 345 678')
    expect(parseClinicPhones('969472111')[0]?.display).toBe('969 472 111')
  })

  it('phonesOf lists each number once, in the order of the cards', () => {
    const a = clinicCardFor({ id: 'a', name: 'A', phone: '969 472 111 / 214 191 988' })
    const b = clinicCardFor({ id: 'b', name: 'B', phone: '214191988 / 272 328 221' })
    expect(phonesOf([a, b]).map((p) => p.number)).toEqual([
      '+351969472111',
      '+351214191988',
      '+351272328221',
    ])
    expect(phonesOf([])).toEqual([])
  })
})

describe('R45 — the patient-facing name of a location', () => {
  it('reads the short code the stored name ends in', () => {
    expect(locationShortCode('OsteoJP (LV)')).toBe('LV')
    expect(locationShortCode('OsteoJP (cb) ')).toBe('CB')
    expect(locationShortCode('OsteoJP (Vila Nova)')).toBeNull()
    expect(locationShortCode('Linda-a-Velha')).toBeNull()
    expect(locationShortCode(null)).toBeNull()
  })

  it('the two known codes still expand to their city', () => {
    const [lv, cb] = [locationDisplayName('OsteoJP (LV)'), locationDisplayName('OsteoJP (CB)')]
    expect(lv).toBeTruthy()
    expect(cb).toBeTruthy()
    expect(lv).not.toBe(cb)
    expect(lv).not.toContain('OsteoJP')
    expect(cb).not.toContain('OsteoJP')
  })

  it('a place written out in brackets after the brand is shown as the place', () => {
    // A new clinic needs no entry anywhere: the rule is about the shape.
    expect(locationDisplayName('OsteoJP (Vila Nova)')).toBe('Vila Nova')
    expect(locationDisplayName('osteojp ( Vila-Nova-de-Cima ) ')).toBe('Vila-Nova-de-Cima')
  })

  it('anything else passes through exactly as typed', () => {
    for (const name of [
      'OsteoJP (ZZ)', // a short code this table does not know: never two letters alone
      'OsteoJP (XYZ)',
      'Vila Nova',
      'Clínica do Centro (Vila Nova)', // not the brand: left alone
      'OsteoJP (a) (b)',
    ]) {
      expect(locationDisplayName(name), name).toBe(name)
    }
    expect(locationDisplayName(null)).toBeNull()
    expect(locationDisplayName(undefined)).toBeUndefined()
    expect(locationDisplayName('')).toBe('')
  })
})
