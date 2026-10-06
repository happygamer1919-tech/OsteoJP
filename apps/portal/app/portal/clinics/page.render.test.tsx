// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PUBLISHED_CLINIC_CARDS, clinicCardsFor, type ClinicCard } from '@/lib/clinics'

// R45 (strategy, 2026-10-06), gate G1 AT THE PAGE: "portal with a test location
// that has no bookable therapist. EXPECT: not listed anywhere patient-facing."
//
// `clinics-server.test.ts` proves the list the page is handed holds the
// locations the API listed and no others. This renders the page with a list
// and reads the HTML a patient would get, because a page can be handed the
// right list and still print something else.

const H = vi.hoisted(() => ({ cards: null as unknown }))

vi.mock('@/lib/clinics-server', () => ({
  loadClinicCards: async () => H.cards,
}))

import ClinicsPage from './page'

const render = async (cards: ClinicCard[] | null): Promise<string> => {
  H.cards = cards
  return renderToStaticMarkup(await ClinicsPage())
}

const articles = (html: string): string[] => html.match(/<article[\s\S]*?<\/article>/g) ?? []

beforeEach(() => {
  H.cards = null
})

describe('R45 — the Clínicas page shows the clinics it is given', () => {
  it('one card per listed clinic, in order, and no card for a clinic that was not listed', async () => {
    // The API listed ONE of the published clinics and a new location. The other
    // published clinic has details in this app and must still not be shown.
    const cards = clinicCardsFor([
      { id: 'loc-new', name: 'OsteoJP (Vila Nova)', address: 'Rua Direita, 10', phone: '266 000 111' },
      { id: 'loc-lv', name: 'OsteoJP (LV)' },
    ])
    const html = await render(cards)
    const shown = articles(html)
    expect(shown).toHaveLength(2)
    expect(shown[0]).toContain(`>${cards[0]!.name}</h3>`)
    expect(shown[1]).toContain('>Vila Nova</h3>')

    const unlisted = PUBLISHED_CLINIC_CARDS.filter((c) => c.id !== 'LV')
    expect(unlisted.length).toBeGreaterThan(0)
    for (const clinic of unlisted) {
      expect(html, clinic.name).not.toContain(clinic.name)
      for (const p of clinic.phone) expect(html, p.display).not.toContain(p.number)
    }
  })

  it('a published clinic keeps every detail it had: two telephones, the email, the hours, the map', async () => {
    const [lv] = clinicCardsFor([{ id: 'loc-lv', name: 'OsteoJP (LV)' }])
    const [card] = articles(await render([lv!]))
    expect(lv!.phone).toHaveLength(2)
    for (const p of lv!.phone) {
      expect(card).toContain(`href="tel:${p.number}"`)
      expect(card).toContain(p.display)
    }
    expect(card).toContain(`href="mailto:${lv!.email}"`)
    expect(card).toContain('09:00 – 19:00')
    expect(card).toContain('target="_blank"')
    expect(card).toContain(lv!.addressLine)
  })

  it('a new location shows its name, address and telephone, and NO hours, email or empty block', async () => {
    const cards = clinicCardsFor([
      { id: 'loc-new', name: 'OsteoJP (Vila Nova)', address: 'Rua Direita, 10', phone: '266 000 111' },
    ])
    const [card] = articles(await render(cards))
    expect(card).toContain('Rua Direita, 10')
    expect(card).toContain('href="tel:+351266000111"')
    expect(card).not.toContain('mailto:')
    // Never a location's opening hours shown as reception hours, and never the
    // "closed at the weekend" line that belongs to published hours.
    expect(card).not.toMatch(/\d{2}:\d{2}/)
    expect(card).not.toContain('Horário')
    expect(card).not.toContain('encerrado')
  })

  it('a location with nothing on file is a name alone: no heading over nothing, no dead link', async () => {
    const [card] = articles(await render(clinicCardsFor([{ id: 'x', name: 'Consultório B' }])))
    expect(card).toContain('>Consultório B</h3>')
    expect(card).not.toContain('Contactos')
    expect(card).not.toContain('href=')
  })

  it('a clinic name with replacement patterns in it is printed as typed', async () => {
    const html = await render(clinicCardsFor([{ id: 'x', name: 'Clínica $& $1' }]))
    expect(html).toContain('aria-label="Clínica Clínica $&amp; $1"')
  })

  it('when the list cannot be read, the published clinics are shown, as before this change', async () => {
    const shown = articles(await render(null))
    expect(shown).toHaveLength(PUBLISHED_CLINIC_CARDS.length)
    PUBLISHED_CLINIC_CARDS.forEach((clinic, i) => {
      expect(shown[i]).toContain(`>${clinic.name}</h3>`)
      expect(shown[i]).toContain(`href="tel:${clinic.phone[0]!.number}"`)
    })
  })

  it('a clinic is named inside its own card and nowhere else on the page', async () => {
    // The page used to open with a sentence listing the clinics. Whatever the
    // words, a clinic's name outside the cards is a list coming back.
    const html = await render(PUBLISHED_CLINIC_CARDS)
    const outside = html.replace(/<article[\s\S]*?<\/article>/g, '')
    expect(outside.length).toBeGreaterThan(50)
    expect(outside).toContain('As nossas clínicas')
    for (const clinic of PUBLISHED_CLINIC_CARDS) expect(outside, clinic.name).not.toContain(clinic.name)
    // And the control: the names ARE on the page, inside the cards.
    for (const clinic of PUBLISHED_CLINIC_CARDS) expect(html).toContain(clinic.name)
  })
})
