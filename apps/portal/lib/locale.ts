import { PORTAL_LOCALES, getPortalStrings, type PortalLocale, type PortalStrings } from '@osteojp/i18n'

/**
 * LANG-01 — THE ONE PLACE THE PORTAL'S LOCALE IS DECIDED.
 *
 * ==========================================================================
 * WHAT THIS REPLACES, AND WHY THE OLD SHAPE COULD NOT BE EXTENDED
 * ==========================================================================
 * `lib/i18n.ts` resolves the locale ONCE, when the module is first imported,
 * to the literal `'pt'`, and exports the resulting frozen dictionary as `s`.
 * That is not a value to change: it is a MODULE CONSTANT shared by every render
 * of every request in the process. Two visitors on one server - one Portuguese,
 * one English - read the same object. There was no seam to pass a locale
 * through; there was a frozen object.
 *
 * ==========================================================================
 * ONE RESOLUTION POINT: THE PROXY. EVERYTHING ELSE READS ITS ANSWER.
 * ==========================================================================
 * `proxy.ts` reads `?lang=` off the URL and stamps `x-portal-locale` on the
 * request. The root layout, the guest page and the account page all read THAT
 * header through `resolvePortalLocale()`. Nothing else parses the query string.
 *
 * THE ALTERNATIVE WAS TWO PATHS AND IT IS THE DEFECT THIS PROJECT KEEPS
 * FINDING. The layout cannot see `searchParams` - App Router layouts are not
 * given them - so a page that read `searchParams` while the layout read a
 * header would be two answers to one question, and they would disagree the
 * first time somebody changed one of them. One source means a page and the
 * `<html lang>` around it cannot come apart.
 *
 * ==========================================================================
 * AN UNKNOWN VALUE IS PORTUGUESE, AND THAT IS NOT A SILENT FALLBACK
 * ==========================================================================
 * `?lang=de` is a typo or a crawler, not an incident: a query parameter is
 * untrusted input on a PUBLIC page, and refusing it would turn a mistyped URL
 * into an error screen on the clinic's booking form.
 *
 * WHAT MAKES THAT SAFE RATHER THAN THE USUAL CONFLATION is that the fallback
 * lands on a REAL, COMPLETE answer: `pt` is the clinic's own language, its
 * dictionary is the canonical one, and rendering it is correct for every
 * visitor who did not ask for anything else. Compare the case §1.3 warns about
 * - a fallback that maps an unknown onto a HARMLESS-LOOKING known one. Here the
 * known one is not a guess about the visitor, it is the default the product
 * has always had.
 *
 * IT RETURNS `PortalLocale`, NEVER `string`. An unvalidated string reaching
 * `getPortalStrings` indexes the dictionary map with a key that is not there,
 * yields `undefined`, and every `s.x.y` after it throws. The union is what
 * makes that unrepresentable.
 */

/** The query parameter, named once. */
export const PORTAL_LOCALE_PARAM = 'lang'

/** The request header the proxy stamps and every reader consumes. */
export const PORTAL_LOCALE_HEADER = 'x-portal-locale'

export const DEFAULT_PORTAL_LOCALE: PortalLocale = 'pt'

/**
 * Validate an untrusted value against the locale union. Never throws; anything
 * that is not exactly a supported locale is the default.
 *
 * PURE, and deliberately not `server-only`: the proxy runs on the edge runtime,
 * the layout and the pages run on the server, and a test runs it in neither.
 * One predicate, three callers, no copies.
 */
export function parsePortalLocale(raw: string | null | undefined): PortalLocale {
  return (PORTAL_LOCALES as readonly string[]).includes(raw ?? '')
    ? (raw as PortalLocale)
    : DEFAULT_PORTAL_LOCALE
}

/** The dictionary for a locale. A thin re-export so no caller reaches past this
 *  module into `@osteojp/i18n` and picks a locale of its own. */
export function portalStrings(locale: PortalLocale): Readonly<PortalStrings> {
  return getPortalStrings(locale)
}

/**
 * The href that switches to `target`, PRESERVING every other query parameter.
 *
 * WRITTEN AS A FUNCTION BECAUSE A HAND-BUILT `?lang=en` LOSES THE REST. Today
 * the guest form carries no other parameters, so a literal would work and would
 * silently stop working the first time one is added - which is exactly the kind
 * of thing nobody notices, because the page still renders and only the other
 * parameter is gone.
 *
 * `URLSearchParams` handles the encoding, so a locale is never interpolated
 * into a URL by hand.
 */
export function localeHref(
  pathname: string,
  target: PortalLocale,
  current: Readonly<Record<string, string | string[] | undefined>> = {},
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(current)) {
    if (key === PORTAL_LOCALE_PARAM) continue
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v)
    } else if (typeof value === 'string') {
      params.set(key, value)
    }
  }
  params.set(PORTAL_LOCALE_PARAM, target)
  return `${pathname}?${params.toString()}`
}
