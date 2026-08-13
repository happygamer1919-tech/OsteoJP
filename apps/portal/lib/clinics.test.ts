import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_CLINIC_PHONES, CLINIC_CONTACTS } from './clinics'

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
  it('has both clinics and at least one number each (guards a vacuous pass)', () => {
    // Without this, every assertion below passes on an empty array — the shape
    // this project has found seven times.
    expect(CLINIC_CONTACTS.length).toBe(2)
    for (const c of CLINIC_CONTACTS) expect(c.phone.length).toBeGreaterThan(0)
    expect(ALL_CLINIC_PHONES.length).toBeGreaterThanOrEqual(4)
  })

  it.each(ALL_CLINIC_PHONES)('$display is dialable E.164', (phone) => {
    // `tel:` needs the E.164 form. A display-only string here would render a
    // link that does nothing when tapped, which is the same dead end one layer
    // down.
    expect(phone.number).toMatch(/^\+351\d{9}$/)
    expect(phone.display.replace(/\s/g, '')).toBe(phone.number.replace('+351', ''))
  })

  it('the LOGIN screen renders them — a shared module nobody imports fixes nothing', () => {
    const login = strip(read('apps/portal/app/auth/login/LoginOtp.tsx'))
    expect(login).toMatch(/ALL_CLINIC_PHONES/)
    expect(login).toMatch(/tel:\$\{/)
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
    expect(page).toMatch(/CLINIC_CONTACTS/)
    // The numbers must not be re-declared here. Two copies of a phone number is
    // how one of them goes stale silently.
    expect(page).not.toMatch(/\+3519\d{8}/)
  })
})
