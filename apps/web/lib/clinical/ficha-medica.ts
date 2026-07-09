// Ficha Médica — the single unified clinical-record template (W5-13).
//
// SPEC-ficha-medica.md sec 1-2 (authoritative). This module is the single
// source of truth for the KEY-IDENTITY decision that W5-13 records:
//
//   Ficha Médica is the `osteopathy` template EVOLVED to a new version
//   (v3, retitled "Ficha Médica"), keeping key = "osteopathy" and all twelve
//   AI field keys UNCHANGED. v2 stays immutable for records that reference it
//   (CLAUDE.md rule 5).
//
// Consequences of the identity path (why nothing changes on the external side):
//   * The record-creation picker offers ONLY this key (highest active version
//     = Ficha Médica); the other templates (ficha_geral / physiotherapy / nesa
//     / the x-form-ref wrappers) are retired FROM CREATION without deleting any
//     row or rewriting any record — existing records keep their template ref.
//   * The live AI pipeline posts `template = osteopathy` (M1_TEMPLATE) carrying
//     the twelve keys; because Ficha Médica IS the osteopathy lineage and the
//     keys are unchanged, that payload maps to Ficha Médica by IDENTITY — zero
//     server-side translation, zero change on André's Make.com side.

/**
 * The template `key` that IS Ficha Médica. Identical to the outbound ingestion
 * selector (`M1_TEMPLATE = "osteopathy"`, apps/web/lib/consultation/m1-webhook.ts)
 * — that identity is what makes the `template=osteopathy` ingestion payload land
 * in Ficha Médica with no translation. Do NOT diverge these two without adding a
 * server-side alias (SPEC sec 2, alternative path).
 */
export const FICHA_MEDICA_KEY = "osteopathy" as const;

/**
 * The twelve AI field keys the external pipeline fills (SPEC sec 2 table).
 * Dotted paths address the nested `systems_review.*` leaves. This is the
 * compatibility contract: every one of these must land in a Ficha Médica field,
 * or W5-13 PRODUCT-halts. They are unchanged from osteopathy v2, so the mapping
 * is identity — this list exists to make the compatibility test assert each key
 * explicitly (no silent drop), not to translate anything.
 */
export const FICHA_MEDICA_AI_KEYS = [
  "consultation_reason",
  "relief_aggravation",
  "clinical_history",
  "systems_review.neurological",
  "systems_review.cardiovascular",
  "systems_review.respiratory",
  "systems_review.gastrointestinal",
  "systems_review.urological_gynecological",
  "systems_review.endocrine",
  "treatment_objectives",
  "treatment_plan",
  "observations",
] as const;

export type FichaMedicaAiKey = (typeof FICHA_MEDICA_AI_KEYS)[number];

/**
 * Resolve a dotted key path (e.g. "systems_review.neurological") against an
 * object, returning the leaf value or undefined if any segment is absent.
 * Used by the ingestion compatibility test to prove each of the twelve values
 * is reachable in the stored payload under its Ficha Médica field path.
 */
export function readFichaKeyPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  let cursor: unknown = source;
  for (const segment of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}
