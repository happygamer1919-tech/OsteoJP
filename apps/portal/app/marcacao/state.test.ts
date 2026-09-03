/**
 * servicesForClinic - which services step 2 of the public form offers.
 *
 * THE RULE IS GUEST-08, 2026-08-19: offered-only-where-priced. A service names
 * the clinics that offer it, and the catalog endpoint DROPS a service offered at
 * no active clinic before the response is built - so an empty list is not "every
 * clinic", and reading it that way would offer a treatment the clinic has turned
 * off on the screen it maintains.
 *
 * THE PREDICATE WAS INLINE IN THE COMPONENT and therefore untestable: this app
 * has no React testing library. The e2e that walks the flow found the fixture
 * gap it hides - the seeded services had NO price rows, so the public catalog
 * listed nothing at all and step 2 was an empty group with a Continuar button.
 */
import { describe, expect, it } from 'vitest'

import { servicesForClinic } from './state'

const LV = 'loc-lv'
const CB = 'loc-cb'

const atLv = { id: 's1', name: 'Osteopatia', locationIds: [LV] }
const atBoth = { id: 's2', name: 'Pilates', locationIds: [LV, CB] }

describe('servicesForClinic', () => {
  it('offers a service only at the clinics that carry it', () => {
    expect(servicesForClinic([atLv], LV)).toEqual([atLv])
    expect(servicesForClinic([atLv], CB)).toEqual([])
  })

  it('keeps a service offered at both', () => {
    expect(servicesForClinic([atBoth], LV)).toEqual([atBoth])
    expect(servicesForClinic([atBoth], CB)).toEqual([atBoth])
  })

  it('offers everything before a clinic is chosen', () => {
    expect(servicesForClinic([atLv, atBoth], '')).toHaveLength(2)
  })

  it('an EMPTY list means nowhere, not everywhere - the GUEST-08 arm', () => {
    // The endpoint never emits this shape (it drops such a service), and the
    // rule is asserted here so a future reader of the type does not restore the
    // pre-GUEST-08 reading from the sentence that used to be on it.
    expect(servicesForClinic([{ id: 's3', name: 'Drenagem', locationIds: [] }], LV)).toEqual([])
  })

  it('does not mutate its input', () => {
    const list = [atLv, atBoth]
    servicesForClinic(list, LV)
    expect(list).toHaveLength(2)
  })
})
