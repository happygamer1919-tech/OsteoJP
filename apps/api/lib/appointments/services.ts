// Which OsteoJP services a PATIENT may self-book online, and how the price they
// see is resolved. Pure (no DB) so the allowlist + pricing rules are unit-tested
// in isolation; the DB layer (store.ts) filters the live services catalog through
// `isBookableServiceName` and resolves price through `effectivePriceCents`.
//
// Grounding: OsteoJP's clinical service set. The two physiotherapy "wrappers"
// (Massagem Terapêutica, Pilates Terapêutico) are explicitly INCLUDED for online
// booking alongside the core consultations. RPG is NOT a bookable service — it
// is the RGPD/privacy consent DOCUMENT that was mis-entered in the catalog (JP
// ruling 2026-07-11); it survives only as a form template, never a service.
// Out-of-V1-scope offerings (Formação) and the deferred NESA form are not
// patient-self-bookable.
//
// Parcerias (partner / protocol pricing): the price shown is whatever the clinic
// has configured for that service+location (the per-location override, else the
// base price). A patient can NEVER self-claim a parceria — there is no discount,
// partner, or price field anywhere in the booking input; price is server-derived
// and display-only (no fiscal document, no payment this phase). Promoting a
// booking to a parceria net rate stays a staff action.

/** Strip accents + lowercase + collapse whitespace so "Pilates Terapêutico",
 *  "pilates terapeutico" and "  PILATES  TERAPEUTICO " all compare equal. */
export function normalizeServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // drop combining diacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical patient-self-bookable OsteoJP services, by normalized name. The two
 * physio wrappers (Massagem Terapêutica, Pilates Terapêutico) are first-class
 * entries here; RPG is deliberately absent — it is the RGPD consent document,
 * not a service. Kept as normalized keys so seed/casing/accent variations still
 * match.
 */
export const BOOKABLE_SERVICE_NAMES: readonly string[] = [
  "osteopatia",
  "fisioterapia",
  "massagem terapeutica",
  "pilates terapeutico",
];

/** The two physiotherapy wrapper services, surfaced for tests/UX grouping. */
export const PHYSIO_WRAPPER_SERVICE_NAMES: readonly string[] = [
  "massagem terapeutica",
  "pilates terapeutico",
];

/** True when a service (by display name) is patient-self-bookable online. */
export function isBookableServiceName(name: string): boolean {
  return BOOKABLE_SERVICE_NAMES.includes(normalizeServiceName(name));
}

/**
 * Price a patient sees for a service at a location: the per-location override
 * (parceria / protocol net price the clinic configured) when present, otherwise
 * the service's base catalog price. `null` means "price not published" — the UI
 * shows the service without a price; booking is still allowed (no payment now).
 * Mirrors the platform's override-then-base resolution; integer cents only.
 */
export function effectivePriceCents(
  basePriceCents: number | null,
  overridePriceCents: number | null,
): number | null {
  return overridePriceCents ?? basePriceCents;
}
