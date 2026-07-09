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

/**
 * Write `value` at a dotted key path into a plain object, creating intermediate
 * plain objects as needed, without mutating the input (structural share only for
 * the untouched branches). Used to project the twelve `_aiIngestionRaw` keys onto
 * their Ficha Médica field paths (identity mapping, W5-17).
 */
function writeFichaKeyPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const segments = path.split(".");
  const [head, ...rest] = segments;
  if (rest.length === 0) {
    return { ...target, [head!]: value };
  }
  const child =
    target[head!] && typeof target[head!] === "object" && !Array.isArray(target[head!])
      ? (target[head!] as Record<string, unknown>)
      : {};
  return { ...target, [head!]: writeFichaKeyPath(child, rest.join("."), value) };
}

/**
 * Project the AI ingestion raw payload's twelve keys (SPEC sec 2) onto their
 * Ficha Médica FIELD PATHS so the Ficha Médica editor (W5-13/14/15/16 RecordForm)
 * renders each AI value in the field it belongs to, EDITABLE.
 *
 * The record's `data` is stored by the ingestion endpoint verbatim under
 * `data._aiIngestionRaw` (store.ts) and does NOT yet carry the keys at their
 * field paths. This maps them there for the editor. The mapping is IDENTITY: the
 * twelve raw keys already sit at exactly the Ficha Médica field paths inside the
 * raw payload (W5-13 key-identity, proved by ficha-medica-compat.test.ts), so
 * each value is copied to the same path.
 *
 * A value is projected only when it is PRESENT in the raw payload (reachable and
 * not undefined). A value already present at the field path in `data` is NOT
 * overwritten — a reviewer's saved edit always wins over the raw AI value. The
 * `_aiIngestionRaw` key is preserved untouched as the source of truth.
 *
 * @returns the projected data AND the list of the twelve keys that could NOT be
 *   reached in the raw payload as `missing` — never silently dropped. The caller
 *   (W5-17) treats a `missing` value that was EXPECTED (present in the raw
 *   payload but unreachable at its field path) as the SPEC sec 2 PRODUCT halt.
 */
export function projectAiPayloadOntoFichaFields(
  data: Record<string, unknown>,
): { data: Record<string, unknown>; projected: string[]; absent: string[] } {
  const raw = data["_aiIngestionRaw"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // No AI payload to project (not an AI-ingested record, or empty payload).
    return { data, projected: [], absent: [...FICHA_MEDICA_AI_KEYS] };
  }
  const rawObj = raw as Record<string, unknown>;
  let out = data;
  const projected: string[] = [];
  const absent: string[] = [];
  for (const path of FICHA_MEDICA_AI_KEYS) {
    const value = readFichaKeyPath(rawObj, path);
    if (value === undefined) {
      // Key not present in the raw payload — nothing to project (the AI simply
      // did not fill it). This is NOT a mapping gap: the field renders empty and
      // editable. Recorded in `absent` for observability.
      absent.push(path);
      continue;
    }
    // Do not clobber a value already set at the field path (a reviewer edit).
    if (readFichaKeyPath(out, path) === undefined) {
      out = writeFichaKeyPath(out, path, value);
    }
    projected.push(path);
  }
  return { data: out, projected, absent };
}
