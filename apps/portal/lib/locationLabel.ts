// Patient-facing location label. The `locations.name` reference data is stored
// in short-code form ("OsteoJP (LV)" / "OsteoJP (CB)"). Patients should see the
// full city name instead. Display-only: the stored name/id are never mutated,
// and any name that is not a known short-code passes through verbatim. The full
// city names are sourced from the portal i18n clinics strings (the canonical
// location names), so they are not duplicated as literals here.
import { s } from '@/lib/i18n'

const CITY_BY_CODE: Record<string, string> = {
  LV: s.clinics.linda_velha_name,
  CB: s.clinics.castelo_branco_name,
}

/**
 * The short code a stored location name ends in, upper-cased: "OsteoJP (LV)" is
 * "LV". Null when the name does not end in one.
 *
 * ONE PARSER, because `lib/clinics.ts` keys the published contact details on
 * the same code this file keys the city name on. Two regular expressions for
 * one convention is how a clinic ends up with its city and somebody else's
 * telephone.
 */
export function locationShortCode(name: string | null | undefined): string | null {
  if (!name) return null
  return name.match(/\(([A-Za-z]{2,})\)\s*$/)?.[1]?.toUpperCase() ?? null
}

/**
 * Expand a stored location label to its full city name for patient display.
 * "OsteoJP (LV)" → "Linda-a-Velha", "OsteoJP (CB)" → "Castelo Branco".
 * Unknown labels (and null/undefined) are returned unchanged.
 *
 * R45 (strategy, 2026-10-06): A LOCATION THE OWNER ADDS NEEDS NO CODE CHANGE.
 * A name typed in Administração > Locais as "OsteoJP (Montemor-o-Novo)", the
 * brand with a place written out in brackets, is shown to patients as the place
 * alone, the way the two short codes above are. It is a rule about the SHAPE of
 * the name, not a third entry in the table. Anything else, a short code this
 * table does not know included, still passes through exactly as typed.
 */
export function locationDisplayName(
  name: string | null | undefined,
): string | null | undefined {
  if (!name) return name
  const code = locationShortCode(name)
  const city = code ? CITY_BY_CODE[code] : undefined
  if (city) return city
  // Four characters or more inside the brackets, so "OsteoJP (MN)" is left
  // alone: unwrapping a short code would show a patient two letters.
  const place = name.match(/^\s*OsteoJP\s*\(([^()]{4,})\)\s*$/i)?.[1]?.trim()
  return place || name
}
