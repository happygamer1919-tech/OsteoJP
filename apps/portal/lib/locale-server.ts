import 'server-only'
import { headers } from 'next/headers'
import type { PortalLocale, PortalStrings } from '@osteojp/i18n'

import {
  PORTAL_LOCALE_HEADER,
  parsePortalLocale,
  portalStrings,
} from './locale'

/**
 * LANG-01 — the server-side read of the locale the proxy resolved.
 *
 * SPLIT FROM `locale.ts` FOR ONE REASON: `proxy.ts` runs on the edge runtime
 * and imports `parsePortalLocale`, and a `server-only` module in that import
 * graph fails the build. The PREDICATE is shared; the `headers()` read is not.
 * Same split `app/auth/login/state.ts` makes for the same class of reason.
 *
 * ==========================================================================
 * IT READS A HEADER AND NOT `searchParams`, AND THAT IS THE WHOLE DESIGN
 * ==========================================================================
 * App Router LAYOUTS are never given `searchParams`. So `<html lang>` cannot be
 * derived from the query string in the layout, and a page that read
 * `searchParams` while the layout read something else would be two answers to
 * one question. The proxy resolves once; everything downstream reads its answer.
 *
 * ==========================================================================
 * IT MAKES ITS CALLER DYNAMIC. MEASURED, NOT ASSUMED.
 * ==========================================================================
 * `headers()` opts a route out of static rendering. The portal's build before
 * this change had FOUR static entries - `/_not-found`, `/apple-icon.png`,
 * `/manifest.webmanifest` and `/portal/clinics` - and every other route was
 * already dynamic. Calling this in the root layout costs the two that render
 * through it: `/portal/clinics` and `/_not-found`. The two asset routes are
 * route handlers and do not use the layout, so they are unaffected.
 *
 * THAT COST IS PAID DELIBERATELY, and the alternative was to leave
 * `<html lang="pt-PT">` on a page rendered in English. A document language that
 * is a constant because there was only ever one possibility is precisely the
 * defect LANG-02 is carded for, one element over.
 */

/** The locale this request resolved to. */
export async function resolvePortalLocale(): Promise<PortalLocale> {
  return parsePortalLocale((await headers()).get(PORTAL_LOCALE_HEADER))
}

/** The locale AND its dictionary, for the common case where a caller wants both. */
export async function resolvePortalStrings(): Promise<{
  locale: PortalLocale
  s: Readonly<PortalStrings>
}> {
  const locale = await resolvePortalLocale()
  return { locale, s: portalStrings(locale) }
}
