import "server-only";

import { normalizeLocationKey, OSTEOJP_LOCATION_CONTACTS } from "../report/location-contacts";
import { signatureStampBytesForLocation } from "./signature-stamp-asset";

// R45 (strategy, 2026-10-06): which clinic WITH A CARIMBO a stored location is.
//
// A location is stored under one of two spellings. The clinic's own rows carry
// the brand and a short code, "OsteoJP (LV)" and "OsteoJP (CB)"; the plain place
// name, "Linda-a-Velha", is the older spelling and the one the fixtures use.
// Both name the same clinic, and the Declaração asks a location one question:
// which carimbo is yours. This module is the ONE place that answers it, for the
// stamp and for the "{localidade}, {dia}" line alike, so a declaration cannot
// carry one clinic's stamp over another clinic's place name.
//
// It is NOT the contact block's resolver. What the footer of a Declaração, of a
// clinical report and of an RGPD form prints is resolveLocationContact's answer
// (report/location-contacts.ts), and that reads the plain name only.

/**
 * The clinics a location can be, by the short code their row is stored under.
 * The value is the canonical key the carimbo slots (signature-stamp-asset.ts)
 * and the city (location-contacts.ts) are both filed under.
 */
const STAMP_CLINIC_KEY_BY_SHORT_CODE: Readonly<Record<string, string>> = {
  LV: "linda-a-velha",
  CB: "castelo-branco",
};

const STAMP_CLINIC_KEYS: readonly string[] = Object.values(STAMP_CLINIC_KEY_BY_SHORT_CODE);

/**
 * The brand, then a code in brackets, and nothing else: "OsteoJP (LV)". Case and
 * surrounding spaces do not matter. It is the same convention
 * apps/portal/lib/clinics.ts asks for before it hands out a clinic's published
 * details, for the same reason: a location somebody named "Sala de testes (LV)"
 * ends in the code and is not the clinic, so it must not be handed the
 * clinic's carimbo.
 */
const BRAND_AND_SHORT_CODE = /^\s*OsteoJP\s*\(([A-Za-z]+)\)\s*$/i;

/**
 * The canonical key of the clinic a location name stands for, when that clinic
 * has a carimbo asset; otherwise null.
 *
 * Accepts the plain name through `normalizeLocationKey`, exactly as before
 * ("Linda-a-Velha", "CASTELO BRANCO"), and the brand-plus-short-code spelling.
 * Null means "no carimbo for this location": a clinic with no asset yet, a
 * short code this table does not name, any other name, and no name at all.
 */
export function resolveStampClinicKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const code = BRAND_AND_SHORT_CODE.exec(name)?.[1]?.toUpperCase();
  const key =
    code && Object.hasOwn(STAMP_CLINIC_KEY_BY_SHORT_CODE, code)
      ? STAMP_CLINIC_KEY_BY_SHORT_CODE[code]
      : normalizeLocationKey(name);
  if (!key || !STAMP_CLINIC_KEYS.includes(key)) return null;
  // The asset decides, not the table above: a clinic listed here whose slot is
  // still empty has no carimbo to print.
  return signatureStampBytesForLocation(key) ? key : null;
}

/**
 * The city printed on the "{localidade}, {dia}" line for a clinic key from
 * `resolveStampClinicKey`: the one already recorded for that key in the
 * location-contacts dataset ("Linda-a-Velha", "Castelo Branco"). Only the city
 * is read; the rest of that entry is the contact block's business.
 */
export function stampClinicCity(key: string): string | null {
  if (!Object.hasOwn(OSTEOJP_LOCATION_CONTACTS, key)) return null;
  return OSTEOJP_LOCATION_CONTACTS[key]?.city?.trim() || null;
}
