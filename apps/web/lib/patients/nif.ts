// PL-31 — Portuguese NIF (número de identificação fiscal) validation.
//
// Pure, no DB and no framework, so it is unit-testable in isolation and can be
// shared by the server validation, the form, and the e2e helpers.
//
// WHY A REAL CHECK AND NOT "NOT EMPTY". The owner's requirement is that a new
// ficha cannot be created without a NIF. A presence-only rule satisfies the
// letter and defeats the purpose: the field becomes mandatory, staff type "0"
// or "-" to get past it, and the column ends up full of values that LOOK
// authoritative on a fatura and are not. Requiring a well-formed NIF is what
// makes the requirement mean anything. Patients who genuinely have no PT NIF
// go through the explicit exemption instead (patients.nif_exempt), which is
// recorded and auditable rather than disguised as a filled-in field.

/**
 * Accepted leading digits/prefixes for a PT NIF.
 *
 * The checksum alone is NOT sufficient: "000000000" satisfies it (the weighted
 * sum is 0, so the expected control digit is 0, which is what it carries), and
 * that is the single most likely thing a hurried user types to escape a
 * required field. The prefix rule is what rejects it.
 *
 * Kept deliberately broad — every prefix in real circulation is here. This is a
 * junk filter, not an eligibility policy, and rejecting a legitimate NIF at the
 * desk is a worse failure than accepting an unusual one.
 */
const VALID_PREFIXES = [
  "1", "2", "3", // individuals
  "45", // non-resident individuals
  "5", // companies (NIPC)
  "6", // public bodies
  "70", "71", "72", "74", "75", "77", "78", "79", // estates, funds, other entities
  "8", // sole traders
  "90", "91", "98", "99", // co-ownerships, non-resident entities, civil societies
];

/**
 * The "consumidor final" generic number. Structurally a valid NIF (it passes
 * both the prefix and the checksum), which is exactly why it is named here.
 *
 * It is the standard PT stand-in for "this customer gave no NIF" — i.e. it
 * means the same thing as the exemption, while looking like a real answer. If
 * it were accepted, it would become the one-keystroke way to defeat the whole
 * requirement and nothing would record that it had been defeated. Rejecting it
 * routes the same intent through the exemption checkbox, where it is stored as
 * a deliberate act with a written reason.
 */
export const CONSUMIDOR_FINAL_NIF = "999999990";

/** Strip the separators people actually type: spaces, dots, hyphens. */
export function normalizeNif(raw: string): string {
  return raw.replace(/[\s.\-]/g, "");
}

/**
 * Why a given NIF is not acceptable, or null when it is.
 *
 * Returns a REASON rather than a boolean so the form and the server can say the
 * same specific thing ("that is the consumidor final number, tick sem NIF
 * instead") instead of a shared, useless "invalid NIF".
 */
export type NifProblem =
  | "empty"
  | "not_nine_digits"
  | "bad_prefix"
  | "bad_checksum"
  | "consumidor_final";

export function checkNif(raw: string | null | undefined): NifProblem | null {
  if (raw === null || raw === undefined) return "empty";
  const n = normalizeNif(raw).trim();
  if (n.length === 0) return "empty";
  if (!/^\d{9}$/.test(n)) return "not_nine_digits";
  if (n === CONSUMIDOR_FINAL_NIF) return "consumidor_final";
  if (!VALID_PREFIXES.some((p) => n.startsWith(p))) return "bad_prefix";
  if (!hasValidCheckDigit(n)) return "bad_checksum";
  return null;
}

export function isValidNif(raw: string | null | undefined): boolean {
  return checkNif(raw) === null;
}

/**
 * The mod-11 control digit: the first eight digits are weighted 9..2, and the
 * ninth digit must equal 11 - (sum mod 11), collapsing to 0 when that lands on
 * 10 or 11.
 */
function hasValidCheckDigit(nine: string): boolean {
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number(nine[i]) * (9 - i);
  }
  const mod = sum % 11;
  const control = mod < 2 ? 0 : 11 - mod;
  return control === Number(nine[8]);
}

/**
 * PL-31 — "ficha incompleta": a patient with neither a NIF nor an exemption.
 *
 * DERIVED, never stored. The only way to reach this state is the consultation
 * quick-create (createStubPatientAction), which the owner deliberately left at
 * name + phone so a therapist is not blocked mid-walk-in by a tax number nobody
 * has yet. Patients registered before 2026-08-03 are in the same state for a
 * different reason, and are treated identically: the ficha is short a NIF and
 * says so, rather than the system pretending otherwise.
 *
 * Note this is NOT the same as "has no NIF". An exempted patient has no NIF and
 * is complete, because the absence is recorded and explained.
 */
export function isFichaIncomplete(p: {
  nif: string | null;
  nifExempt: boolean;
}): boolean {
  return (p.nif === null || p.nif === "") && !p.nifExempt;
}

/**
 * Complete a valid NIF from an 8-digit stem by computing its control digit.
 * Exists for TESTS and seeds, which need well-formed NIFs that are obviously
 * synthetic. Not used by product code.
 */
export function nifWithCheckDigit(eightDigitStem: string): string {
  if (!/^\d{8}$/.test(eightDigitStem)) {
    throw new Error("nifWithCheckDigit expects exactly 8 digits");
  }
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    sum += Number(eightDigitStem[i]) * (9 - i);
  }
  const mod = sum % 11;
  const control = mod < 2 ? 0 : 11 - mod;
  return `${eightDigitStem}${control}`;
}
