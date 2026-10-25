/**
 * The booking flow's service step, RENDERED: the empty state (Q-R, 2026-10-22).
 *
 * Under Q-R the catalog offers a service at a clinic only while a therapist
 * offered online there is ticked for it, so a clinic the portal lists can have
 * no service at all. The step then says so instead of showing a heading over
 * nothing. The text is written out here, character for character, and not read
 * from the dictionary, so a changed dictionary is a red test.
 *
 * It renders the real component to static markup with `react-dom/server`, as
 * `GuestBookingForm.render.test.tsx` does. The home clinic is preselected, so
 * the flow opens on the service step.
 *
 * WHAT IS REPLACED, AND NONE OF IT IS UNDER TEST: the server action module and
 * the router.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BookableLocation, BookableService } from '@/lib/api/client'

vi.mock('./actions', () => ({
  loadSlots: async () => ({ slots: [] }),
  loadTherapists: async () => ({ therapists: [] }),
  submitBooking: async () => ({ ok: true }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }))

import { BookingFlow } from './BookingFlow'

const EMPTY = 'Não há serviços disponíveis para marcação online nesta clínica. Contacte a clínica.'

const UM: BookableLocation = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Clinica Um' }
const DOIS: BookableLocation = { id: '00000000-0000-4000-8000-0000000000a2', name: 'Clinica Dois' }

const svc = (id: string, name: string, locationIds: string[]): BookableService => ({
  id,
  name,
  durationMin: 60,
  priceCents: null,
  currency: 'EUR',
  locationIds,
})

const render = (services: BookableService[]) =>
  renderToStaticMarkup(
    <BookingFlow
      locations={[UM, DOIS]}
      services={services}
      preselectedServiceId={null}
      preselectedLocationId={UM.id}
    />,
  )

describe('booking flow, service step: the empty state (Q-R)', () => {
  it('a clinic with no service offered online says so', () => {
    // The only service is offered at the OTHER clinic, so Clinica Um has none.
    const html = render([svc('00000000-0000-4000-8000-0000000000b1', 'Servico Dois', [DOIS.id])])
    expect(html).toContain('Escolha o serviço')
    expect(html).toContain(EMPTY)
    expect(html).not.toContain('Servico Dois')
  })

  it('control: a clinic with a service lists it and shows no empty state', () => {
    const html = render([svc('00000000-0000-4000-8000-0000000000b2', 'Servico Um', [UM.id])])
    expect(html).toContain('Servico Um')
    expect(html).not.toContain(EMPTY)
  })
})
