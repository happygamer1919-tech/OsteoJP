/**
 * "A minha conta", RENDERED: the patient's survey switch (SAT-01, S8).
 *
 * WHAT IT PROVES. The account screen is handed a profile by the API. The API
 * puts `surveyEnabled` in it only for a patient the survey applies to: never
 * while the survey is switched off, and under canary only for a listed patient
 * (apps/api/lib/patient/profile.ts, and its suites). So the whole rule of this
 * screen is one line, and this file reads the HTML a patient would get:
 *
 *   NO KEY: nothing of the survey is on the page. No title, no switch, no
 *   hint, no note. The reminder switches are where they were.
 *
 *   THE KEY, ON OR OFF: the section sits below the reminder switches with the
 *   four approved texts (docs/design/SAT-01-copy-pt.md, 32 to 35), the note
 *   only while the switch is off.
 *
 * The texts are written out here, character for character, and not read from
 * the dictionary, so a changed dictionary is a red test.
 *
 * It renders the real component to static markup with `react-dom/server`,
 * already a dependency of this app (no testing library is added), as
 * `GuestBookingForm.render.test.tsx` does.
 *
 * WHAT IS REPLACED, AND NONE OF IT IS UNDER TEST: the server action module (it
 * reads cookies, and a render calls no action), the router and the browser
 * Supabase client the sign-out button holds.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { PatientProfile } from '@/lib/api/client'

import en from '../../../../../packages/i18n/src/portal/strings.en.json'
import pt from '../../../../../packages/i18n/src/portal/strings.pt.json'

vi.mock('./actions', () => ({
  signOutAction: async () => {},
  updateProfileAction: async () => {},
  updateReminderPrefsAction: async () => {},
  updateSurveyPrefAction: async () => ({ ok: true }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))
vi.mock('@/lib/supabase/client', () => ({ createBrowserClient: () => ({ auth: { signOut: async () => {} } }) }))

import { AccountView } from './AccountView'

/** The approved texts, 32 to 35, as the copy document has them. */
const TITLE = 'Avaliações de satisfação'
const SWITCH = 'Receber avaliações de satisfação'
const HINT =
  'Enviada por email ou SMS 24 horas depois de uma consulta, no máximo uma vez a cada 60 dias. A equipa da clínica também a pode enviar.'
const OFF_NOTE = 'Desligar não afeta os lembretes de consulta.'

const PROFILE: PatientProfile = {
  id: '00000000-0000-4000-8000-000000000001',
  fullName: 'Paciente Fixture',
  email: 'paciente@fixture.test',
  phone: null,
  address: null,
  postalCode: null,
  city: null,
  reminderSmsEnabled: true,
  reminderEmailEnabled: false,
}

const render = (profile: PatientProfile | null): string =>
  renderToStaticMarkup(
    <AccountView
      profile={profile}
      fullName={profile?.fullName ?? ''}
      email={profile?.email ?? ''}
      locale="pt"
    />,
  )

/** Every `role="switch"` input of the page, in document order, as its tag. */
const switches = (html: string): string[] => html.match(/<input[^>]*role="switch"[^>]*>/g) ?? []
const named = (html: string, name: string): string[] =>
  switches(html).filter((tag) => tag.includes(`aria-label="${name}"`))

describe('the account screen and the survey switch', () => {
  it('the dictionaries hold the approved texts, in both languages', () => {
    expect(pt.account.survey_title).toBe(TITLE)
    expect(pt.account.survey_switch).toBe(SWITCH)
    expect(pt.account.survey_hint).toBe(HINT)
    expect(pt.account.survey_off_note).toBe(OFF_NOTE)
    expect(en.account.survey_title).toBe('Satisfaction surveys')
    expect(en.account.survey_switch).toBe('Receive satisfaction surveys')
    expect(en.account.survey_hint).toBe(
      'Sent by email or SMS 24 hours after an appointment, at most once every 60 days. The clinic team can also send it.',
    )
    expect(en.account.survey_off_note).toBe('Turning this off does not affect appointment reminders.')
  })

  it('NO KEY (the survey is switched off, or this patient is not on the canary list): nothing of the survey', () => {
    for (const profile of [PROFILE, { ...PROFILE, surveyEnabled: undefined }, null]) {
      const html = render(profile)
      // The page itself rendered: the two reminder switches are there.
      expect(switches(html)).toHaveLength(2)
      expect(named(html, 'SMS')).toHaveLength(1)
      expect(named(html, 'Email')).toHaveLength(1)
      for (const text of [TITLE, SWITCH, HINT, OFF_NOTE, 'avaliaç', 'Avaliaç', 'satisfação']) {
        expect(html, text).not.toContain(text)
      }
      expect(html).not.toContain('survey-toggle')
    }
  })

  it('a value that is not a boolean is no key: the screen never guesses a default', () => {
    for (const value of [null, 'true', 1, 0]) {
      const html = render({ ...PROFILE, surveyEnabled: value as unknown as boolean })
      expect(switches(html), String(value)).toHaveLength(2)
      expect(html).not.toContain(TITLE)
    }
  })

  it('THE KEY, ON: the section with its title, the switch on, the hint, and no note', () => {
    const html = render({ ...PROFILE, surveyEnabled: true })
    expect(switches(html)).toHaveLength(3)
    const [tag] = named(html, SWITCH)
    expect(tag).toBeDefined()
    expect(tag).toContain('checked=""')
    expect(html).toContain(`>${TITLE}</h3>`)
    expect(html).toContain(`>${SWITCH}</p>`)
    expect(html).toContain(`>${HINT}</p>`)
    expect(html).not.toContain(OFF_NOTE)
    // Below the reminder switches, above the sign-out button.
    const at = (needle: string) => html.indexOf(needle)
    expect(at('aria-label="Email"')).toBeGreaterThan(-1)
    expect(at(`>${TITLE}</h3>`)).toBeGreaterThan(at('aria-label="Email"'))
    expect(at(pt.auth.logout)).toBeGreaterThan(at(`>${TITLE}</h3>`))
  })

  it('THE KEY, OFF: the switch off, and the note that the reminders are not affected', () => {
    const html = render({ ...PROFILE, surveyEnabled: false })
    const [tag] = named(html, SWITCH)
    expect(tag).toBeDefined()
    expect(tag).not.toContain('checked=""')
    expect(html).toContain(`>${HINT}</p>`)
    expect(html).toContain(`>${OFF_NOTE}</p>`)
  })

  it('the reminder switches show what the profile says, whatever the survey switch says', () => {
    for (const surveyEnabled of [true, false]) {
      const html = render({ ...PROFILE, reminderSmsEnabled: false, reminderEmailEnabled: true, surveyEnabled })
      expect(named(html, 'SMS')[0]).not.toContain('checked=""')
      expect(named(html, 'Email')[0]).toContain('checked=""')
    }
  })
})
