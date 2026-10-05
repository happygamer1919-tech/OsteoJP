/**
 * The public form, RENDERED, on the step that asks for the contacts.
 *
 * WHY THIS FILE EXISTS BESIDE screen.test.ts. That suite reads the SOURCE and the
 * dictionary, and says why: it proves a string is referenced by the screen that
 * must show it. It cannot prove that the line reaches the markup on step 4 and on
 * no other step, in each language, which is what an owner-approved sentence about
 * what a visitor's contacts are used for has to do. So this renders the real
 * component to static markup with `react-dom/server`, already a dependency of
 * this app (no testing library is added).
 *
 * WHAT IS REPLACED, AND NEITHER IS UNDER TEST: the server action module (it
 * imports the database package, and a render calls no action), and React's
 * `useActionState`, so the form can be put on a chosen step: its state is
 * otherwise reachable only by posting four times.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PortalStrings } from '@osteojp/i18n'

import en from '../../../../packages/i18n/src/portal/strings.en.json'
import pt from '../../../../packages/i18n/src/portal/strings.pt.json'
import staffPt from '../../../../packages/i18n/src/strings.pt.json'

import { EMPTY_GUEST_VALUES, INITIAL_GUEST_STATE, type GuestFormState, type GuestStep } from './state'

const H = vi.hoisted(() => ({ state: null as unknown }))

vi.mock('./actions', () => ({ guestBookingAction: async () => H.state }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useActionState: () => [H.state, () => {}, false] }
})

import { GuestBookingForm } from './GuestBookingForm'

const PT_SENTENCE =
  'Os contactos que indicar (telemóvel e, se o fornecer, email) são usados para confirmar e gerir a sua marcação.'
const EN_SENTENCE =
  'The contact details you give (mobile and, if provided, email) are used to confirm and manage your booking.'

const LOCATION = 'aaaaaaaa-0000-0000-0000-000000000001'
const SERVICE = 'bbbbbbbb-0000-0000-0000-000000000001'

function render(locale: 'pt' | 'en', step: GuestStep, intake: boolean): string {
  const state: GuestFormState = {
    ...INITIAL_GUEST_STATE,
    step,
    intake,
    values: {
      ...EMPTY_GUEST_VALUES,
      locationId: LOCATION,
      serviceId: SERVICE,
      preferredDate: '2030-01-07',
      preferredPeriod: 'manha',
    },
  }
  H.state = state
  return renderToStaticMarkup(
    <GuestBookingForm
      s={(locale === 'pt' ? pt : en) as unknown as PortalStrings}
      locale={locale}
      localeLinks={[]}
      catalog={{
        locations: [{ id: LOCATION, name: 'Fixture Clinic' }],
        services: [{ id: SERVICE, name: 'Fixture Service', locationIds: [] }],
      } as unknown as Parameters<typeof GuestBookingForm>[0]['catalog']}
      minDate="2030-01-01"
      maxDate="2030-03-31"
      rgpdLabel={staffPt['clinical.consent.rgpd.label']}
      rgpdBody={staffPt['clinical.consent.rgpd.body']}
      confirmationCopy={{ title: 'x', body: 'y' }}
      intakeEnabled={intake}
      dobMin="1900-01-01"
      dobMax="2030-01-01"
    />,
  )
}

/** The text of the one element carrying a test id, or null. */
const textOf = (html: string, testId: string): string | null => {
  const m = new RegExp(`<p[^>]*data-testid="${testId}"[^>]*>([^<]*)</p>`).exec(html)
  return m ? m[1]! : null
}

beforeEach(() => {
  H.state = null
})

describe('the sentence about what the contacts are used for (owner-approved, 2026-10-05)', () => {
  it('renders in PORTUGUESE on step 4, word for word', () => {
    const html = render('pt', 4, false)
    expect(textOf(html, 'guest-contact-use')).toBe(PT_SENTENCE)
    expect(html.split('data-testid="guest-contact-use"')).toHaveLength(2)
  })

  it('renders in ENGLISH on step 4, word for word', () => {
    const html = render('en', 4, false)
    expect(textOf(html, 'guest-contact-use')).toBe(EN_SENTENCE)
    expect(html).not.toContain(PT_SENTENCE)
  })

  it('sits UNDER the two contact fields and ABOVE the consent, and is not inside the consent panel', () => {
    const html = render('pt', 4, false)
    const phone = html.indexOf('name="phone"')
    const email = html.indexOf('name="email"')
    const sentence = html.indexOf('data-testid="guest-contact-use"')
    const consentBody = html.indexOf(staffPt['clinical.consent.rgpd.body'].slice(0, 60))
    const consentBox = html.indexOf('name="consent"')
    expect(phone).toBeGreaterThan(0)
    expect(email).toBeGreaterThan(phone)
    expect(sentence).toBeGreaterThan(email)
    expect(consentBody).toBeGreaterThan(sentence)
    expect(consentBox).toBeGreaterThan(consentBody)
    // THE CONSENT PARAGRAPH IS RENDERED WHOLE AND UNCHANGED beside it: the same
    // characters the dictionary holds, with nothing appended to them.
    expect(html).toContain(`>${staffPt['clinical.consent.rgpd.body']}</p>`)
  })

  it('on the FIVE-step flow it is still on step 4, with the contact fields, though the consent has moved to step 5', () => {
    const four = render('pt', 4, true)
    expect(textOf(four, 'guest-contact-use')).toBe(PT_SENTENCE)
    expect(four).not.toContain('name="consent"')
    const five = render('pt', 5, true)
    expect(five).not.toContain('guest-contact-use')
    expect(five).toContain('name="consent"')
    // Step 5's consent panel is the two pinned texts and nothing of this sentence.
    expect(five).not.toContain(PT_SENTENCE)
  })

  it.each([1, 2, 3] as const)('is NOT shown on step %i, where no contact is asked for', (step) => {
    const html = render('pt', step, false)
    expect(html).not.toContain('guest-contact-use')
    expect(html).not.toContain(PT_SENTENCE)
  })

  it('THE CONTROL: the render really is the step it was asked for (step 4 has the email field, step 1 does not)', () => {
    expect(render('pt', 4, false)).toContain('type="email"')
    expect(render('pt', 1, false)).not.toContain('type="email"')
  })
})
