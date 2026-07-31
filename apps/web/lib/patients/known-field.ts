/**
 * PL-20 — "never ask for what the patient record already holds."
 *
 * Owner CR 2026-07-31: "the declaracao document asks for NIF again although it
 * was filled at the time of adding the patient ... don't even ask to input but
 * auto fill and reflect at the result".
 *
 * The declaração already PREFILLED the NIF (W12-24). It rendered an editable
 * box seeded with the stored value, which is what reads as being asked again —
 * and which looks plainly empty for a patient whose NIF was never captured, so
 * the same box means two different things.
 *
 * One rule, applied like PL-14 applied it to locations:
 *
 *   known   -> show it, do not ask. An explicit "alterar" keeps a one-off
 *              override possible for THIS document without touching the record.
 *   unknown -> ask once, and write what is entered BACK to the patient, so the
 *              third document does not ask again.
 *
 * Pure, so the same decision is made in the dialog and re-made on the server
 * (the client's opinion about what is "known" is never trusted for the write).
 */

export type KnownField =
  /** The record holds a value: display it, ask nothing. */
  | { kind: "known"; value: string }
  /** Nothing on file: ask, and persist what comes back. */
  | { kind: "unknown" };

/** Blank, whitespace and null all mean "not on file". */
export function knownField(stored: string | null | undefined): KnownField {
  const t = (stored ?? "").trim();
  return t.length > 0 ? { kind: "known", value: t } : { kind: "unknown" };
}

/**
 * Whether a value captured on a document should be written back to the patient.
 *
 * TRUE only when the record held nothing and the user supplied something. It
 * deliberately never overwrites: a one-off correction typed onto a declaration
 * (a patient using a company NIF, say) must not silently rewrite the patient's
 * own fiscal number, and a typo in a document must not become the record.
 * Filling a genuinely empty field is the only automatic write this earns.
 */
export function shouldPersistCapturedValue(
  stored: string | null | undefined,
  entered: string | null | undefined,
): boolean {
  return knownField(stored).kind === "unknown" && knownField(entered).kind === "known";
}
