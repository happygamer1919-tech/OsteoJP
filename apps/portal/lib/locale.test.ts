import { describe, expect, it } from 'vitest'
import { PORTAL_LOCALES } from '@osteojp/i18n'

import {
  DEFAULT_PORTAL_LOCALE,
  PORTAL_LOCALE_PARAM,
  localeHref,
  parsePortalLocale,
  portalStrings,
} from './locale'

/**
 * LANG-01 — the locale resolver, pinned in both directions.
 *
 * THE ASSERTIONS THAT EARN THEIR KEEP ARE THE ONES ABOUT UNTRUSTED INPUT.
 * `?lang=` is a query parameter on a PUBLIC page: it arrives from crawlers,
 * typos and hand-edited URLs, and every one of those must land somewhere real
 * rather than indexing the dictionary map with a key that is not in it.
 */
describe('parsePortalLocale', () => {
  it('accepts every locale the package declares', () => {
    // Enumerated from PORTAL_LOCALES rather than listed by hand: a third locale
    // added to the package fails HERE, naming itself, instead of silently
    // becoming unreachable through the URL.
    expect(PORTAL_LOCALES.length).toBeGreaterThan(1)
    for (const l of PORTAL_LOCALES) expect(parsePortalLocale(l)).toBe(l)
  })

  it('lands on Portuguese for every shape of nothing and nonsense', () => {
    for (const bad of [null, undefined, '', ' ', 'de', 'PT', 'pt-PT', 'en_US', '../pt', '[]']) {
      expect(parsePortalLocale(bad), JSON.stringify(bad)).toBe(DEFAULT_PORTAL_LOCALE)
    }
  })

  it('is CASE SENSITIVE, and that is the safe direction', () => {
    // `PT` is not a locale this package has. Accepting it would mean the parser
    // and the dictionary disagreed about what a locale is, and the dictionary
    // is the one that throws.
    expect(parsePortalLocale('PT')).toBe('pt')
    expect(portalStrings(parsePortalLocale('PT'))).toBe(portalStrings('pt'))
  })

  it('every value it can return indexes a real dictionary', () => {
    // The property the union exists for, asserted rather than trusted: whatever
    // comes out of the parser can be handed to `portalStrings` without an
    // `undefined` reaching a component.
    for (const raw of ['pt', 'en', 'de', '', null]) {
      const d = portalStrings(parsePortalLocale(raw))
      expect(typeof d.guest.title).toBe('string')
      expect(d.guest.title.length).toBeGreaterThan(0)
    }
  })
})

describe('localeHref', () => {
  it('sets the parameter on a bare path', () => {
    expect(localeHref('/marcacao', 'en')).toBe(`/marcacao?${PORTAL_LOCALE_PARAM}=en`)
  })

  it('REPLACES an existing lang rather than appending a second one', () => {
    const href = localeHref('/marcacao', 'pt', { lang: 'en' })
    expect(href).toBe('/marcacao?lang=pt')
    expect(href.match(/lang=/g)).toHaveLength(1)
  })

  it('PRESERVES every other parameter, which is the whole reason it is a function', () => {
    // Today the guest form carries no other parameters, so a literal `?lang=en`
    // would work - and would silently start dropping things the first time one
    // was added. That is the failure this is written against.
    const href = localeHref('/marcacao', 'en', { utm_source: 'cartaz', ref: 'lv' })
    expect(href).toContain('utm_source=cartaz')
    expect(href).toContain('ref=lv')
    expect(href).toContain('lang=en')
  })

  it('keeps repeated parameters repeated', () => {
    const href = localeHref('/marcacao', 'en', { tag: ['a', 'b'] })
    expect(href.match(/tag=/g)).toHaveLength(2)
  })

  it('ENCODES rather than interpolating', () => {
    const href = localeHref('/marcacao', 'en', { q: 'a b&c=d' })
    expect(href).not.toContain('a b&c=d')
    expect(new URL(href, 'https://x.test').searchParams.get('q')).toBe('a b&c=d')
  })
})
