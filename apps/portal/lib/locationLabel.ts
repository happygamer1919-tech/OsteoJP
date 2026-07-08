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
 * Expand a stored location label to its full city name for patient display.
 * "OsteoJP (LV)" → "Linda-a-Velha", "OsteoJP (CB)" → "Castelo Branco".
 * Unknown labels (and null/undefined) are returned unchanged.
 */
export function locationDisplayName(
  name: string | null | undefined,
): string | null | undefined {
  if (!name) return name
  const code = name.match(/\(([A-Za-z]{2,})\)\s*$/)?.[1]?.toUpperCase()
  const city = code ? CITY_BY_CODE[code] : undefined
  return city ?? name
}
