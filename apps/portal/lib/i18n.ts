// Portal-side locale accessor.
//
// ==========================================================================
// THIS IS THE FROZEN DICTIONARY. IT IS LEGACY, AND ITS SCOPE IS ENFORCED.
// ==========================================================================
// `s` below is resolved ONCE, when this module is first imported, to the
// literal `'pt'`. It is a MODULE CONSTANT shared by every render of every
// request in the process, so a surface that imports it CANNOT be rendered in
// two languages by the same server, whatever the page decides.
//
// LANG-01 (2026-09-07) converted the PUBLIC GUEST FLOW to a per-request
// dictionary: `proxy.ts` resolves the locale from `?lang=` and stamps a header,
// and `lib/locale-server.ts` reads it. Server components call
// `resolvePortalStrings()`; client components take the dictionary AS A PROP.
//
// THE OTHER 27 FILES STILL IMPORT THIS, DELIBERATELY. They are the
// AUTHENTICATED portal, and a signed-in patient's language is a STORED FACT
// about that person - a column BLUE owns, feeding a background SMS job that has
// no request to read a header from. Converting them before the column exists
// would resolve every one of them to the same `pt` through a longer path.
//
// SO TWO MECHANISMS COEXIST, AND THE BOUNDARY IS MECHANICAL RATHER THAN
// REMEMBERED. `scripts/portal-frozen-locale-is-quarantined.test.mjs` fails, in
// the required CI job, if any file under a converted prefix imports `s`. Without
// it a new file in the guest flow would type-check, render, and be silently
// Portuguese inside an English page.
//
// WHEN THE LAST PREFIX CONVERTS, DELETE `s` AND DELETE THE GUARD. A compile
// error over 27 files is strictly better than a check, and it only becomes
// available once there is nothing left that needs the constant.
import { getPortalStrings, type PortalLocale, type PortalStrings } from '@osteojp/i18n'

/** @deprecated The frozen locale. Use `resolvePortalLocale()` on a converted surface. */
export const locale: PortalLocale = 'pt'

/** @deprecated The frozen `pt` dictionary — see the header. New code on a
 *  converted surface takes its dictionary from `resolvePortalStrings()` (server)
 *  or as a prop (client). */
export const s: Readonly<PortalStrings> = getPortalStrings(locale)
