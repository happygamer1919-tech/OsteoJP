// How the price a patient sees is resolved.
//
// WHICH SERVICES A PATIENT MAY BOOK IS NO LONGER DECIDED HERE. It is the
// `services.patient_bookable` column, added by migration 0057 and set from JP's
// ruling. Decision B: "patient_bookable replaces the name allowlist."
//
// WHAT WAS HERE AND WHY IT HAD TO GO, because deleting a rule deserves the
// reason written down. `BOOKABLE_SERVICE_NAMES` held four normalized names —
// osteopatia, fisioterapia, massagem terapeutica, pilates terapeutico — and
// `isBookableServiceName` compared a display name against them. Applying 0057
// to production is what exposed the defect: the live catalog holds TWENTY rows
// and exactly ONE of those four names exists in it. "Osteopatia/Posturologia" is
// not "Osteopatia" to an exact normalized comparison, so an osteopathy clinic's
// portal could not sell osteopathy, and nothing in the code was ever going to
// notice — every test of the rule used fixture names built to satisfy it.
// Card W13-04a carries the full finding.
//
// Parcerias (partner / protocol pricing): the price shown is whatever the clinic
// has configured for that service+location (the per-location override, else the
// base price). A patient can NEVER self-claim a parceria — there is no discount,
// partner, or price field anywhere in the booking input; price is server-derived
// and display-only (no fiscal document, no payment this phase). Promoting a
// booking to a parceria net rate stays a staff action.

/**
 * May a patient book THIS service? W13-04, Decision B, the whole rule in one
 * place.
 *
 * A PURE PREDICATE OVER A ROW, and it is a function rather than three clauses
 * inline in a query for one reason: the clauses are testable this way, including
 * the negative arms that prove each one is load-bearing. `store.ts` selects the
 * columns and calls this; nothing else decides.
 *
 * THE THREE REFUSALS ARE INDEPENDENT AND NONE IMPLIES ANOTHER:
 *   isActive        — the service is retired or not yet live. Nobody books it,
 *                     staff included.
 *   patientBookable — JP's ruling, per service. Staff may still book it; a
 *                     patient may not. This is the column that replaced the name
 *                     allowlist.
 *   internalOnly    — an accounting or internal row ("Diversos"). Staff-bookable,
 *                     never offered to a patient, and never bookable BY one.
 *
 * WHY internalOnly IS CHECKED HERE AND NOT ONLY IN THE CATALOG QUERY. The
 * catalog list filtered it out of the WIZARD, so a patient never SAW an internal
 * service — but seeing is not the control. This predicate runs on the path that
 * resolves a service ID a caller SUPPLIES, and a caller can supply any id.
 * Decision B is explicit that it "does not ship without the internalOnly check
 * at both call sites plus a refusal test in the same PR", and this is why: the
 * allowlist was accidentally providing that protection, so deleting it without
 * adding this would have opened an exposure rather than closing one.
 */
export function isServiceBookableByPatient(row: {
  isActive: boolean;
  patientBookable: boolean;
  internalOnly: boolean;
}): boolean {
  return row.isActive && row.patientBookable && !row.internalOnly;
}

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
