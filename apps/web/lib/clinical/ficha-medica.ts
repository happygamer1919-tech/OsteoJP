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
 * TWO RULES GOVERN WHAT GETS WRITTEN, AND THEY ARE DELIBERATELY NOT SYMMETRIC.
 *
 * 1. WHAT COUNTS AS A VALUE WORTH PROJECTING (the incoming side). A raw value is
 *    projected only when it is reachable AND is not `undefined`, not `null`, and
 *    not a string that is empty or whitespace-only. Anything else is treated as
 *    "the AI did not fill this" and recorded in `absent`, exactly as an omitted
 *    key always has been.
 *
 * 2. WHAT COUNTS AS AN ALREADY-SET FIELD (the existing side). A field path is
 *    treated as unset — and therefore writable — only when what sits there is
 *    `undefined` or `null`. AN EMPTY STRING AT A FIELD PATH IS A SET VALUE and is
 *    never overwritten.
 *
 * Rule 2 is narrower than rule 1 on purpose. An empty string arriving FROM the AI
 * is noise, but an empty string sitting AT a field path is a reviewer who
 * deliberately cleared that field, and refilling it from the raw payload would
 * silently undo a clinical decision. See the comment at the clobber guard.
 *
 * The `_aiIngestionRaw` key is preserved untouched as the source of truth.
 *
 * @returns the projected data AND, as `absent`, the list of the twelve keys that
 *   carried no usable value in the raw payload — never silently dropped. The
 *   caller (W5-17) treats an absent value that was EXPECTED (present in the raw
 *   payload but unreachable at its field path) as the SPEC sec 2 PRODUCT halt.
 */
export function projectAiPayloadOntoFichaFields(
  data: Record<string, unknown>,
): {
  data: Record<string, unknown>;
  projected: string[];
  absent: string[];
  unknown: string[];
} {
  const raw = data["_aiIngestionRaw"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // No AI payload to project (not an AI-ingested record, or empty payload).
    return { data, projected: [], absent: [...FICHA_MEDICA_AI_KEYS], unknown: [] };
  }
  const rawObj = raw as Record<string, unknown>;
  let out = data;
  const projected: string[] = [];
  const absent: string[] = [];
  for (const path of FICHA_MEDICA_AI_KEYS) {
    const value = readFichaKeyPath(rawObj, path);
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    ) {
      // Nothing usable in the raw payload — the AI did not fill this. Covers an
      // omitted key (undefined), an explicit null, and a string that is empty or
      // whitespace-only. The null case is not hypothetical: a strict JSON schema
      // declares every property required and expresses unfilled ones as null, so
      // "omit it" and "send null" are the same statement from the partner's side.
      // This is NOT a mapping gap: the field renders empty and editable.
      // Recorded in `absent` for observability, exactly as before.
      absent.push(path);
      continue;
    }
    // Do not clobber a value already set at the field path (a reviewer edit).
    //
    // ONLY undefined AND null COUNT AS UNSET HERE. An empty string does NOT, and
    // that asymmetry with the guard above is intentional — do not unify them. A
    // reviewer who deliberately CLEARED a field left an empty string behind, and
    // treating that as unset would refill it from the AI payload and silently
    // undo their decision. Blank-in means "no value"; blank-out means "no value,
    // and a human meant it".
    const existing = readFichaKeyPath(out, path);
    if (existing === undefined || existing === null) {
      out = writeFichaKeyPath(out, path, value);
    }
    projected.push(path);
  }
  return { data: out, projected, absent, unknown: unknownPayloadKeys(rawObj) };
}

/**
 * AI-02 — keys the partner sent that this build has NO field for.
 *
 * ==========================================================================
 * INVISIBLE IS NOT ABSENT, AND THAT IS THE WHOLE DEFECT.
 * ==========================================================================
 * The projection walks FICHA_MEDICA_AI_KEYS and copies what it finds. It never
 * looked the other way. A key the partner puts in `_aiIngestionRaw` that maps to
 * no ficha field is stored verbatim (so it is not LOST) and reaches no field, no
 * editor and no reviewer's eye.
 *
 * OWNER-REPORTED, AND THE INSTANCE IS WHY THIS IS NOT HOUSEKEEPING: a payload
 * arrived with two keys that never reached a field, AND ONE OF THEM WAS AN
 * ALARM-SYMPTOM ANSWER. A clinician reviewing that draft saw a complete-looking
 * form. (Recorded as reported: this function was written from the contract, not
 * from a stored payload, because no terminal may read production.)
 *
 * ==========================================================================
 * THE ALLOWLIST IS DERIVED, AND HAND-WRITING IT IS THE TRAP IN THIS CARD.
 * ==========================================================================
 * FICHA_MEDICA_AI_KEYS holds TWELVE DOTTED PATHS, six of them under
 * `systems_review.*`. The distinct TOP-LEVEL keys are SEVEN. Comparing the
 * payload's top-level keys against the twelve paths would flag `systems_review`
 * — the single most important container in the payload — as unknown drift on
 * every record, every time. Deriving it with `split(".")[0]` also means it
 * cannot go stale against the contract it is checking.
 *
 * ONE LEVEL DEEP INTO `systems_review`, because an unknown nested leaf has the
 * same invisibility and the same clinical weight — an unrecognised
 * `systems_review.neurological_v2` is exactly the shape the reported incident
 * had. Reported dotted, so a reader sees where it sat.
 *
 * KEY NAMES ONLY, NEVER VALUES (CLAUDE.md rule 7). An unknown key's value is
 * clinical content by definition. Everything downstream of this — the log line,
 * the reviewer's banner — carries names.
 *
 * `template` and anything underscore-prefixed are envelope, not content.
 */
function unknownPayloadKeys(raw: Record<string, unknown>): string[] {
  const top = new Set(FICHA_MEDICA_AI_KEYS.map((k) => k.split(".")[0]!));
  const nested = new Set(
    FICHA_MEDICA_AI_KEYS.filter((k) => k.startsWith("systems_review.")).map((k) =>
      k.slice("systems_review.".length),
    ),
  );

  const out: string[] = [];
  for (const key of Object.keys(raw)) {
    if (key === "template" || key.startsWith("_")) continue;
    if (!top.has(key)) {
      out.push(key);
      continue;
    }
    // A known container: look one level in. Only systems_review has leaves in
    // the contract, so only it can produce a nested unknown.
    if (key !== "systems_review") continue;
    const inner = raw[key];
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    for (const leaf of Object.keys(inner as Record<string, unknown>)) {
      if (!nested.has(leaf)) out.push(`systems_review.${leaf}`);
    }
  }
  return out;
}
